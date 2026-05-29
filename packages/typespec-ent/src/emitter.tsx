import { render, writeOutput, SourceDirectory, SourceFile } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { bootstrapEmitter, getSchemaName, isBootstrapSuccess } from "@qninhdt/typespec-orm";
import { EntDataFile } from "./components/EntDataStruct.jsx";
import { EntModelFile } from "./components/EntSchema.jsx";
import {
  generateAtlasHcl,
  generateEntGenerateGo,
  generateEnumsFile,
  generateStandaloneGitignore,
  generateStandaloneGoMod,
  generateStandaloneReadme,
} from "./components/ent-scaffolding.js";
import { reportDiagnostic, type EntEmitterOptions } from "./lib.js";

export async function emit(context: EmitContext<EntEmitterOptions>): Promise<void> {
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const collectionStrategy = options["collection-strategy"];
  const goVersion = options["go-version"] ?? "1.24";
  const onUpdateEmitRawSql = options["on-update-emit-raw-sql"] ?? false;
  const emitAtlasHcl = options["emit-atlas-hcl"] ?? true;

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
  const tables = selection.models.filter((model) => model.kind === "table");
  const schemaModels = selection.models.filter(
    (model) => model.kind === "table" || model.kind === "mixin",
  );

  // Collect every distinct Postgres schema referenced by @schema(...) on
  // included tables so atlas.hcl's `dev` URL can list them on `search_path`.
  // Preserve insertion order; default to "public" when nothing is set.
  const schemaNames = new Set<string>();
  for (const entry of tables) {
    const name = getSchemaName(program, entry.model);
    if (name) schemaNames.add(name);
  }
  if (schemaNames.size === 0) schemaNames.add("public");
  const atlasSchemas = [...schemaNames];

  const tree = (
    <SourceDirectory path=".">
      {tables.length > 0 && emitAtlasHcl && (
        <SourceFile path="atlas.hcl" filetype="hcl" printWidth={9999}>
          {generateAtlasHcl(atlasSchemas)}
        </SourceFile>
      )}
      {isStandalone && tables.length > 0 && (
        <>
          <SourceFile path="go.mod" filetype="go" printWidth={9999}>
            {generateStandaloneGoMod(libraryName ?? "", goVersion)}
          </SourceFile>
          <SourceFile path="README.md" filetype="md" printWidth={9999}>
            {generateStandaloneReadme(libraryName ?? "", options.version)}
          </SourceFile>
          <SourceFile path=".gitignore" filetype="md" printWidth={9999}>
            {generateStandaloneGitignore()}
          </SourceFile>
          <SourceDirectory path="ent">
            <SourceFile path="generate.go" filetype="go" printWidth={9999}>
              {generateEntGenerateGo()}
            </SourceFile>
          </SourceDirectory>
        </>
      )}
      {schemaModels.length > 0 && (
        <SourceDirectory path="ent/schema">
          {schemaModels.map((model) => (
            <EntModelFile
              program={program}
              normalizedModel={model}
              modelLookup={graph.byModel}
              collectionStrategy={collectionStrategy}
              onUpdateEmitRawSql={onUpdateEmitRawSql}
            />
          ))}
        </SourceDirectory>
      )}
      {namespaceGroups.map((models) => {
        const dataModels = models.filter((model) => model.kind === "data");
        const enumFile = generateEnumsFile(dataModels);
        if (!enumFile && dataModels.length === 0) return null;
        return (
          <SourceDirectory path={models[0].namespaceDir}>
            {enumFile && (
              <SourceFile path="enums.go" filetype="go" printWidth={9999}>
                {enumFile}
              </SourceFile>
            )}
            {dataModels.map((model) => (
              <EntDataFile
                program={program}
                model={model.model}
                label={model.label ?? model.name}
                packageName={model.packageName}
                normalizedModel={model}
                modelLookup={graph.byModel}
                libraryName={libraryName}
                emitEnums={false}
              />
            ))}
          </SourceDirectory>
        );
      })}
    </SourceDirectory>
  );

  const output = render(tree);
  try {
    await writeOutput(output, outputDir);
  } catch (e) {
    reportDiagnostic(context.program, {
      code: "emit-write-failed",
      target: context.program.getGlobalNamespaceType(),
      format: { outputDir, error: e instanceof Error ? e.message : String(e) },
    });
  }
}
