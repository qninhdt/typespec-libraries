/**
 * TypeSpec emitter that generates namespace-grouped SQLModel / Pydantic files.
 */
import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext, ModelProperty, Model } from "@typespec/compiler";
import {
  camelToSnake,
  collectManyToManyAssociations,
  generatedHeader,
  getColumnName,
  getEnumMembers,
  getMaxLength,
  getPrecision,
  getTableName,
  normalizeOrmGraph,
  resolveDbType,
  selectModelsForEmitter,
  type ManyToManyAssociation,
  type NormalizedOrmGraph,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { buildPythonImportBlock, generateInit } from "./components/PyConstants.js";
import { PyDataFile } from "./components/PyDataModel.jsx";
import { PyModelFile } from "./components/PyModel.jsx";
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

export async function emit(context: EmitContext<SqlModelEmitterOptions>): Promise<void> {
  const { program } = context;
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const isStandalone = options.standalone ?? false;
  const libraryName = options["library-name"];
  const collectionStrategy = options["collection-strategy"];

  if (isStandalone && !libraryName) {
    reportDiagnostic(program, {
      code: "standalone-requires-library-name",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  const graph = normalizeOrmGraph(program);
  const selection = selectModelsForEmitter(program, graph, {
    include: options.include,
    exclude: options.exclude,
    kinds: ["table", "data"],
  });
  const tables = selection.models.filter((model) => model.kind === "table");
  const dataModels = selection.models.filter((model) => model.kind === "data");

  if (tables.length === 0 && dataModels.length === 0) {
    reportDiagnostic(program, {
      code: "no-tables-found",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  const namespaceGroups = [...selection.byNamespace.values()].sort((a, b) =>
    a[0].namespace.localeCompare(b[0].namespace),
  );
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

  const tree = (
    <SourceDirectory path=".">
      {isStandalone && (
        <SourceFile path="pyproject.toml" filetype="toml" printWidth={9999}>
          {`[project]
name = "${libraryName}"
version = "0.0.0"
description = "Generated SQLModel classes"
requires-python = ">=3.10"
dependencies = [
    "sqlmodel>=0.0.14",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = [` +
            selection.topLevelNamespaces.map((item) => `"${item}"`).join(", ") +
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
              />
            ))}
          {models
            .filter((model) => model.kind === "data")
            .map((model) => (
              <PyDataFile program={program} model={model.model} label={model.label ?? model.name} />
            ))}
        </SourceDirectory>
      ))}
    </SourceDirectory>
  );

  const output = render(tree);
  await writeOutput(output, outputDir);
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
    const maxLen = Math.max(...getEnumMembers(prop.type).map((item) => item.value.length), 20);
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

function toPythonIdentifier(name: string): string {
  const normalized = name.replaceAll(/[^\w]/g, "_");
  const startsWithDigit = /^\d/.test(normalized);
  return startsWithDigit ? `_${normalized}` : normalized;
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
