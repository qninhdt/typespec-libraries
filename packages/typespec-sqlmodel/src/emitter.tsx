import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext, ModelProperty, Model, Scalar } from "@typespec/compiler";
import {
  bootstrapEmitter,
  isBootstrapSuccess,
  camelToSnake,
  collectManyToManyAssociations,
  generatedHeader,
  getColumnName,
  getEnumMembers,
  getMaxLength,
  getPrecision,
  getTableName,
  resolveDbType,
  type ManyToManyAssociation,
  type NormalizedOrmGraph,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { buildPythonImportBlock, generateInit } from "./components/PyConstants.js";
import { toPythonIdentifier } from "./components/py-field-utils.js";
import { PyDataFile } from "./components/PyDataModel.jsx";
import { PyModelFile } from "./components/PyModel.jsx";
import { buildMappedByIndex } from "./components/PyRelationField.jsx";
import {
  buildPythonScalarAliasNames,
  collectAliasableScalarsForModels,
  PyScalarsFile,
} from "./components/PyScalars.jsx";
import { reportDiagnostic, type SqlModelEmitterOptions } from "./lib.js";

interface AssociationImportRef {
  moduleName: string;
  symbol: string;
}

interface PackageInfo {
  dir: string;
  moduleName: string;
  models: { name: string; moduleFile: string }[];
  childPackages: Set<string>;
  includeMetadata: boolean;
  importAssociations: boolean;
}

interface AssociationModuleFile {
  dir: string;
  content: string;
}

interface ScalarGroup {
  topLevel: string;
  scalars: Scalar[];
  aliasNames: Map<Scalar, string>;
}

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

  // Build the inverse-mappedBy index once — N×M property walks become O(N).
  const allRelationModels = new Set<Model>();
  for (const model of [...tables, ...modelsByKind.mixin]) {
    allRelationModels.add(model.model);
  }
  const mappedByIndex = buildMappedByIndex(program, allRelationModels);

  const tree = (
    <SourceDirectory path=".">
      {tables.length > 0 && isStandalone && (
        <SourceFile path="atlas.hcl" filetype="hcl" printWidth={9999}>
          {generateAtlasHcl()}
        </SourceFile>
      )}
      {isStandalone && (
        <SourceFile path="pyproject.toml" filetype="toml" printWidth={9999}>
          {`[project]
name = ${JSON.stringify(libraryName)}
version = "0.0.0"
description = "Generated SQLModel classes"
requires-python = ">=3.10"
dependencies = [
    "atlas-provider-sqlalchemy>=0.3.0",
    "sqlmodel>=0.0.14",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = [` +
            selection.topLevelNamespaces.map((item) => `"${camelToSnake(item)}"`).join(", ") +
            `]
`}
        </SourceFile>
      )}
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
          <PyScalarsFile program={program} scalars={group.scalars} aliasNames={group.aliasNames} />
        </SourceDirectory>
      ))}
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

function generateAtlasHcl(): string {
  return `data "external_schema" "sqlmodel" {
  program = [
    "atlas-provider-sqlalchemy",
    "--path", ".",
    "--dialect", "postgresql"
  ]
}

env "sqlmodel" {
  src = data.external_schema.sqlmodel.url
  dev = "docker://postgres/16/dev?search_path=public"
  migration {
    dir = "file://migrations"
  }
  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}
`;
}

function buildScalarGroups(
  program: EmitContext<SqlModelEmitterOptions>["program"],
  models: NormalizedOrmModel[],
): ScalarGroup[] {
  const byTopLevel = new Map<string, NormalizedOrmModel[]>();
  for (const model of models) {
    const topLevel = model.namespacePath[0];
    if (!topLevel) continue;
    const group = byTopLevel.get(topLevel) ?? [];
    group.push(model);
    byTopLevel.set(topLevel, group);
  }

  return [...byTopLevel.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([topLevel, groupModels]) => {
      const scalars = collectAliasableScalarsForModels(
        program,
        groupModels.map((model) => model.model),
      );
      return {
        topLevel,
        scalars,
        aliasNames: buildPythonScalarAliasNames(program, scalars),
      };
    })
    .filter((group) => group.scalars.length > 0);
}

function buildPackageInfo(
  models: NormalizedOrmModel[],
  associationDirs: string[],
): Map<string, PackageInfo> {
  const packages = new Map<string, PackageInfo>();

  const ensurePackage = (dir: string, moduleName: string): PackageInfo => {
    const existing = packages.get(dir);
    if (existing) {
      return existing;
    }

    const info: PackageInfo = {
      dir,
      moduleName,
      models: [],
      childPackages: new Set<string>(),
      includeMetadata: !dir.includes("/"),
      importAssociations: false,
    };
    packages.set(dir, info);
    return info;
  };

  for (const model of models) {
    for (let i = 1; i <= model.namespacePath.length; i++) {
      const dir = model.namespacePath.slice(0, i).join("/");
      ensurePackage(dir, dir.replaceAll("/", "."));
      if (i < model.namespacePath.length) {
        const parentDir = model.namespacePath.slice(0, i).join("/");
        const childName = model.namespacePath[i];
        ensurePackage(parentDir, parentDir.replaceAll("/", ".")).childPackages.add(childName);
      }
    }

    ensurePackage(model.namespaceDir, model.namespace).models.push({
      name: model.model.name,
      moduleFile: camelToSnake(model.model.name),
    });
  }

  for (const dir of associationDirs) {
    ensurePackage(dir, dir.replaceAll("/", ".")).importAssociations = true;
  }

  return packages;
}

function buildAssociationModules(
  program: EmitContext<SqlModelEmitterOptions>["program"],
  graph: NormalizedOrmGraph,
  associations: ManyToManyAssociation[],
  associationImportsByProp: Map<ModelProperty, AssociationImportRef>,
  runtimeImportsByModel: Map<Model, Map<string, Set<string>>>,
): AssociationModuleFile[] {
  const grouped = new Map<string, ManyToManyAssociation[]>();

  for (const association of associations) {
    const leftInfo = graph.byModel.get(association.leftModel);
    const rightInfo = graph.byModel.get(association.rightModel);
    const topLevels = [leftInfo?.namespacePath[0], rightInfo?.namespacePath[0]].filter(
      (item): item is string => !!item,
    );
    const topLevel = [...new Set(topLevels)].sort((left, right) => left.localeCompare(right))[0];
    if (!topLevel) {
      continue;
    }
    if (topLevels.length === 2 && topLevels[0] !== topLevels[1]) {
      reportDiagnostic(program, {
        code: "no-tables-found",
        target: association.leftProperty,
      });
    }

    const moduleName = `${topLevel}.__associations__`;
    const symbol = toPythonIdentifier(association.tableName);

    associationImportsByProp.set(association.leftProperty, { moduleName, symbol });
    associationImportsByProp.set(association.rightProperty, { moduleName, symbol });
    addRuntimeImport(runtimeImportsByModel, association.leftModel, moduleName, symbol);
    addRuntimeImport(runtimeImportsByModel, association.rightModel, moduleName, symbol);

    const bucket = grouped.get(topLevel) ?? [];
    bucket.push(association);
    grouped.set(topLevel, bucket);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dir, items]) => ({
      dir,
      content: renderAssociationModule(program, items),
    }));
}

function renderAssociationModule(
  program: EmitContext<SqlModelEmitterOptions>["program"],
  associations: ManyToManyAssociation[],
): string {
  const sqlalchemyImports = new Set<string>([
    "sqlalchemy.Column",
    "sqlalchemy.ForeignKey",
    "sqlalchemy.Table",
  ]);
  const lines: string[] = [
    `# ${generatedHeader}`,
    "# Source: https://github.com/qninhdt/typespec-libraries",
    "",
  ];

  for (const association of associations) {
    resolveAssociationColumnType(program, association.leftKey, sqlalchemyImports);
    resolveAssociationColumnType(program, association.rightKey, sqlalchemyImports);
  }

  const allExports: string[] = [];
  const sortedAssociations = [...associations].sort((a, b) =>
    a.tableName.localeCompare(b.tableName),
  );
  lines.push(
    buildPythonImportBlock(new Set(), sqlalchemyImports, new Set(["SQLModel"]), "sqlmodel"),
    "",
  );
  for (const association of sortedAssociations) {
    const symbol = toPythonIdentifier(association.tableName);
    allExports.push(`    "${symbol}",`);
    const leftColumn = buildAssociationColumn(
      program,
      association.leftJoinColumn,
      association.leftModel,
      association.leftKey,
      sqlalchemyImports,
    );
    const rightColumn = buildAssociationColumn(
      program,
      association.rightJoinColumn,
      association.rightModel,
      association.rightKey,
      sqlalchemyImports,
    );
    lines.push(
      `${symbol} = Table(`,
      `    "${association.tableName}",`,
      "    SQLModel.metadata,",
      `    ${leftColumn},`,
      `    ${rightColumn},`,
      ")",
      "",
    );
  }

  lines.push("__all__ = [", ...allExports, "]");

  return lines.join("\n");
}

function resolveAssociationColumnType(
  program: EmitContext<SqlModelEmitterOptions>["program"],
  prop: ModelProperty,
  sqlalchemyImports: Set<string>,
): string {
  if (prop.type.kind === "Enum") {
    sqlalchemyImports.add("sqlalchemy.String");
    const maxLen = Math.max(
      ...getEnumMembers(prop.type).map((item) => String(item.value ?? "").length),
      20,
    );
    return `String(${maxLen})`;
  }

  const dbType = resolveDbType(prop.type);
  const maxLength = getMaxLength(program, prop) ?? 255;
  const precision = getPrecision(program, prop);

  switch (dbType) {
    case "uuid":
      sqlalchemyImports.add("sqlalchemy.dialects.postgresql.UUID as PGUUID");
      return "PGUUID(as_uuid=True)";
    case "text":
      sqlalchemyImports.add("sqlalchemy.Text");
      return "Text";
    case "boolean":
      sqlalchemyImports.add("sqlalchemy.Boolean");
      return "Boolean";
    case "int8":
    case "int16":
      sqlalchemyImports.add("sqlalchemy.SmallInteger");
      return "SmallInteger";
    case "int32":
    case "serial":
    case "uint8":
    case "uint16":
      sqlalchemyImports.add("sqlalchemy.Integer");
      return "Integer";
    case "int64":
    case "bigserial":
    case "uint32":
    case "uint64":
      sqlalchemyImports.add("sqlalchemy.BigInteger");
      return "BigInteger";
    case "float32":
      sqlalchemyImports.add("sqlalchemy.Float");
      return "Float";
    case "float64":
      sqlalchemyImports.add("sqlalchemy.Double");
      return "Double";
    case "decimal":
      sqlalchemyImports.add("sqlalchemy.Numeric");
      if (precision) {
        return `Numeric(${precision.precision}, ${precision.scale})`;
      }
      return "Numeric";
    case "utcDateTime":
      sqlalchemyImports.add("sqlalchemy.DateTime");
      return "DateTime(timezone=True)";
    case "date":
      sqlalchemyImports.add("sqlalchemy.Date");
      return "Date";
    case "time":
      sqlalchemyImports.add("sqlalchemy.Time");
      return "Time";
    case "duration":
      sqlalchemyImports.add("sqlalchemy.Interval");
      return "Interval";
    case "bytes":
      sqlalchemyImports.add("sqlalchemy.LargeBinary");
      return "LargeBinary";
    case "jsonb":
      sqlalchemyImports.add("sqlalchemy.dialects.postgresql.JSONB");
      return "JSONB";
    case "string":
    default:
      sqlalchemyImports.add("sqlalchemy.String");
      return `String(${maxLength})`;
  }
}

function addRuntimeImport(
  runtimeImportsByModel: Map<Model, Map<string, Set<string>>>,
  model: Model,
  moduleName: string,
  symbol: string,
): void {
  const byModule = runtimeImportsByModel.get(model) ?? new Map<string, Set<string>>();
  const names = byModule.get(moduleName) ?? new Set<string>();
  names.add(symbol);
  byModule.set(moduleName, names);
  runtimeImportsByModel.set(model, byModule);
}

function buildAssociationColumn(
  program: EmitContext<SqlModelEmitterOptions>["program"],
  joinColumn: string,
  model: Model,
  key: ModelProperty,
  sqlalchemyImports: Set<string>,
): string {
  const columnType = resolveAssociationColumnType(program, key, sqlalchemyImports);
  const foreignKey = `${getTableName(program, model)}.${getColumnName(program, key)}`;
  return `Column(${JSON.stringify(joinColumn)}, ${columnType}, ForeignKey(${JSON.stringify(foreignKey)}), primary_key=True)`;
}
