import type { ModelProperty } from "@typespec/compiler";
import type { EmitContext, Model, Program } from "@typespec/compiler";
import {
  generatedHeader,
  getColumnName,
  getEnumMembers,
  getMaxLength,
  getPrecision,
  getSchemaName,
  getTableName,
  resolveDbType,
  type ManyToManyAssociation,
  type NormalizedOrmGraph,
} from "@qninhdt/typespec-orm";
import { buildPythonImportBlock } from "./components/PyConstants.js";
import { toPythonIdentifier } from "./components/py-field-utils.js";
import { reportDiagnostic, type SqlModelEmitterOptions } from "./lib.js";

export interface AssociationImportRef {
  moduleName: string;
  symbol: string;
}

export interface AssociationModuleFile {
  dir: string;
  content: string;
}

export function buildAssociationModules(
  program: EmitContext<SqlModelEmitterOptions>["program"],
  graph: NormalizedOrmGraph,
  associations: ManyToManyAssociation[],
  associationImportsByProp: Map<ModelProperty, AssociationImportRef>,
  runtimeImportsByModel: Map<Model, Map<string, Set<string>>>,
  selectedTopLevels: ReadonlySet<string>,
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
        code: "cross-namespace-many-to-many-unsupported",
        target: association.leftProperty,
        format: {
          leftModel: association.leftModel.name,
          leftNamespace: topLevels[0],
          rightModel: association.rightModel.name,
          rightNamespace: topLevels[1],
        },
      });
    }

    const moduleName = `${topLevel}.__associations__`;
    const symbol = toPythonIdentifier(association.tableName);

    // Filter awareness — if `exclude` (or a narrow `include`) drops the
    // top-level package the association is anchored to, the
    // `from <top>.__associations__ import …` line emitted on each endpoint
    // would resolve to a missing module at runtime. Surface that mismatch
    // as a hard diagnostic instead of producing broken Python.
    if (!selectedTopLevels.has(topLevel)) {
      reportDiagnostic(program, {
        code: "filtered-association-table-missing",
        target: association.leftProperty,
        format: {
          tableName: association.tableName,
          topLevel,
          symbol,
        },
      });
    }

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

function renderAssociationModule(program: Program, associations: ManyToManyAssociation[]): string {
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
  program: Program,
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
  program: Program,
  joinColumn: string,
  model: Model,
  key: ModelProperty,
  sqlalchemyImports: Set<string>,
): string {
  const columnType = resolveAssociationColumnType(program, key, sqlalchemyImports);
  const tableName = getTableName(program, model);
  const schema = getSchemaName(program, model);
  const qualifiedTable = schema ? `${schema}.${tableName}` : tableName;
  const foreignKey = `${qualifiedTable}.${getColumnName(program, key)}`;
  return `Column(${JSON.stringify(joinColumn)}, ${columnType}, ForeignKey(${JSON.stringify(foreignKey)}), primary_key=True)`;
}
