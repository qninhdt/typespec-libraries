import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext, ModelProperty, Model, Scalar } from "@typespec/compiler";
import {
  bootstrapEmitter,
  isBootstrapSuccess,
  camelToSnake,
  collectManyToManyAssociations,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { generateInit } from "./components/PyConstants.js";
import { PyDataFile } from "./components/PyDataModel.jsx";
import { PyModelFile } from "./components/PyModel.jsx";
import { buildMappedByIndex } from "./components/PyRelationField.jsx";
import { PyScalarsFile } from "./components/PyScalars.jsx";
import { buildAssociationModules, type AssociationImportRef } from "./emitter-associations.js";
import { buildPackageInfo, buildScalarGroups, buildSharedScalars } from "./emitter-package-info.js";
import {
  generateAtlasHcl,
  generatePyprojectToml,
  generateStandaloneReadme,
} from "./emitter-standalone-files.js";
import { reportDiagnostic, type SqlModelEmitterOptions } from "./lib.js";

export async function emit(context: EmitContext<SqlModelEmitterOptions>): Promise<void> {
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const collectionStrategy = options["collection-strategy"];

  const result = bootstrapEmitter(context, {
    kinds: ["table", "mixin", "data"],
    include: options.include,
    exclude: options.exclude,
    autoIncludeDependencies: options["auto-include-dependencies"],
    standalone: options.standalone,
    libraryName: options["library-name"],
  });

  if (!isBootstrapSuccess(result)) {
    if (result.reason === "standalone-requires-library-name") {
      reportDiagnostic(context.program, {
        code: "standalone-requires-library-name",
        target: context.program.getGlobalNamespaceType(),
      });
    } else {
      reportDiagnostic(context.program, {
        code: "no-tables-found",
        target: context.program.getGlobalNamespaceType(),
      });
    }
    return;
  }

  const { program, graph, selection, namespaceGroups, isStandalone, libraryName } = result;
  const emitAtlas = options["emit-atlas"] ?? false;

  // Partition once and reuse — avoids three separate filter passes per
  // namespace group below.
  const modelsByKind: Record<NormalizedOrmModel["kind"], NormalizedOrmModel[]> = {
    table: [],
    mixin: [],
    data: [],
  };
  for (const model of selection.models) {
    modelsByKind[model.kind].push(model);
  }
  const tables = modelsByKind.table;

  const manyToManyAssociations = collectManyToManyAssociations(
    program,
    tables.map((model) => model.model),
  );
  const associationImportsByProp = new Map<ModelProperty, AssociationImportRef>();
  const runtimeImportsByModel = new Map<Model, Map<string, Set<string>>>();
  const associationModules = buildAssociationModules(
    program,
    graph,
    manyToManyAssociations,
    associationImportsByProp,
    runtimeImportsByModel,
    new Set(selection.topLevelNamespaces),
  );
  const manyToManySecondaryByProp = new Map(
    [...associationImportsByProp.entries()].map(([prop, ref]) => [prop, ref.symbol]),
  );
  const packageInfo = buildPackageInfo(
    selection.models,
    associationModules.map((item) => item.dir),
  );
  const scalarGroups = buildScalarGroups(program, selection.models);
  const scalarGroupsByTopLevel = new Map(scalarGroups.map((group) => [group.topLevel, group]));
  // Cross-namespace scalar dedup — a scalar reachable from N>=2 top-levels is
  // emitted once under `_shared/scalars.py` and re-exported from each
  // top-level's `_scalars.py`. Single-top-level groups stay inline.
  const sharedScalars = buildSharedScalars(scalarGroups);
  const sharedAliasNames = new Map<Scalar, string>();
  for (const scalar of sharedScalars) {
    // Pick the alias name from any group that contains the scalar — they all
    // resolve to the same Python identifier because the scalar is identical.
    for (const group of scalarGroups) {
      const alias = group.aliasNames.get(scalar);
      if (alias) {
        sharedAliasNames.set(scalar, alias);
        break;
      }
    }
  }
  const sharedScalarSet = new Set(sharedScalars);

  // Build the inverse-mappedBy index once — N×M property walks become O(N).
  const allRelationModels = new Set<Model>();
  for (const model of [...tables, ...modelsByKind.mixin]) {
    allRelationModels.add(model.model);
  }
  const mappedByIndex = buildMappedByIndex(program, allRelationModels);

  const tree = (
    <SourceDirectory path=".">
      {tables.length > 0 && isStandalone && emitAtlas && (
        <SourceFile path="atlas.hcl" filetype="hcl" printWidth={9999}>
          {generateAtlasHcl()}
        </SourceFile>
      )}
      {isStandalone && (
        <SourceFile path="pyproject.toml" filetype="toml" printWidth={9999}>
          {generatePyprojectToml({
            libraryName: libraryName ?? "generated-sqlmodel",
            version: options.version ?? "0.0.0",
            description: options.description,
            topLevelNamespaces: selection.topLevelNamespaces,
          })}
        </SourceFile>
      )}
      {isStandalone && (
        <SourceFile path="README.md" filetype="md" printWidth={9999}>
          {generateStandaloneReadme({
            libraryName: libraryName ?? "generated-sqlmodel",
            description: options.description,
          })}
        </SourceFile>
      )}
      {isStandalone && (
        <SourceFile path="LICENSE" filetype="txt" printWidth={9999}>
          {options.license ?? "Proprietary — internal use only\n"}
        </SourceFile>
      )}
      {isStandalone &&
        selection.topLevelNamespaces.map((topLevel) => (
          <SourceDirectory path={camelToSnake(topLevel)}>
            <SourceFile path="py.typed" filetype="txt" printWidth={9999}>
              {""}
            </SourceFile>
          </SourceDirectory>
        ))}
      {[...packageInfo.values()]
        .sort((a, b) => a.dir.localeCompare(b.dir))
        .map((info) => (
          <SourceDirectory path={info.dir}>
            <SourceFile path="__init__.py" filetype="py" printWidth={9999}>
              {generateInit({
                moduleName: info.moduleName,
                models: info.models,
                childPackages: [...info.childPackages].sort((left, right) =>
                  left.localeCompare(right),
                ),
                includeMetadata: info.includeMetadata,
                importAssociations: info.importAssociations,
                reportCollision: ({ name, packageName }) =>
                  reportDiagnostic(context.program, {
                    code: "init-export-collision",
                    target: context.program.getGlobalNamespaceType(),
                    format: { name, packageName },
                  }),
              })}
            </SourceFile>
          </SourceDirectory>
        ))}
      {associationModules.map((file) => (
        <SourceDirectory path={file.dir}>
          <SourceFile path="__associations__.py" filetype="py" printWidth={9999}>
            {file.content}
          </SourceFile>
        </SourceDirectory>
      ))}
      {scalarGroups.map((group) => (
        <SourceDirectory path={group.topLevel}>
          <PyScalarsFile
            program={program}
            scalars={group.scalars}
            aliasNames={group.aliasNames}
            reexports={sharedScalarSet}
            reexportFromModule=".._shared.scalars"
          />
        </SourceDirectory>
      ))}
      {sharedScalars.length > 0 && (
        <SourceDirectory path="_shared">
          <SourceFile path="__init__.py" filetype="py" printWidth={9999}>
            {""}
          </SourceFile>
          <PyScalarsFile
            program={program}
            scalars={sharedScalars}
            aliasNames={sharedAliasNames}
            path="scalars.py"
          />
        </SourceDirectory>
      )}
      {namespaceGroups.map((models) => (
        <SourceDirectory path={models[0].namespaceDir}>
          {models
            .filter((model) => model.kind === "table")
            .map((model) => (
              <PyModelFile
                program={program}
                normalizedModel={model}
                modelLookup={graph.byModel}
                collectionStrategy={collectionStrategy}
                manyToManySecondaryByProp={manyToManySecondaryByProp}
                runtimeImports={runtimeImportsByModel.get(model.model)}
                scalarAliasNames={scalarGroupsByTopLevel.get(model.namespacePath[0])?.aliasNames}
                mappedByIndex={mappedByIndex}
              />
            ))}
          {models
            .filter((model) => model.kind === "mixin")
            .map((model) => (
              <PyModelFile
                program={program}
                normalizedModel={model}
                modelLookup={graph.byModel}
                collectionStrategy={collectionStrategy}
                scalarAliasNames={scalarGroupsByTopLevel.get(model.namespacePath[0])?.aliasNames}
                mappedByIndex={mappedByIndex}
              />
            ))}
          {models
            .filter((model) => model.kind === "data")
            .map((model) => (
              <PyDataFile
                program={program}
                model={model.model}
                label={model.label ?? model.name}
                normalizedModel={model}
                modelLookup={graph.byModel}
                scalarAliasNames={scalarGroupsByTopLevel.get(model.namespacePath[0])?.aliasNames}
              />
            ))}
        </SourceDirectory>
      ))}
    </SourceDirectory>
  );

  const output = render(tree);
  try {
    await writeOutput(output, outputDir);
  } catch (e) {
    reportDiagnostic(context.program, {
      code: "emit-write-failed",
      target: context.program.getGlobalNamespaceType(),
      format: { fileName: outputDir, error: e instanceof Error ? e.message : String(e) },
    });
  }
}
