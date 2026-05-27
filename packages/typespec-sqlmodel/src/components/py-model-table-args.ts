import { walkPropertiesInherited, type Model, type Program } from "@typespec/compiler";
import {
  camelToSnake,
  classifyProperties,
  collectCompositeTypeFields,
  getCheck,
  getColumnName,
  getIndexUsing,
  getPartialIndex,
  getPolymorphicConfig,
  getSchemaName,
  getTableName,
  isIndex,
  isKey,
  isUnique,
} from "@qninhdt/typespec-orm";
import { FOUR_SPACES, pythonStringLiteral } from "./PyConstants.js";

export function buildTableArgEntries(
  program: Program,
  model: Model,
  compositeTypeFields: ReturnType<typeof collectCompositeTypeFields>,
  saImports: Set<string>,
): string[] {
  const tableArgEntries = buildCompositeTableArgEntries(compositeTypeFields, saImports);
  addCheckConstraints(program, model, saImports, tableArgEntries);
  addIndexUsingEntries(program, model, saImports, tableArgEntries);
  addPartialIndexEntries(program, model, saImports, tableArgEntries);
  const schemaName = getSchemaName(program, model);
  if (schemaName) {
    tableArgEntries.push(
      `${FOUR_SPACES}${FOUR_SPACES}{"schema": ${pythonStringLiteral(schemaName)}}`,
    );
  }
  return tableArgEntries;
}

function buildCompositeTableArgEntries(
  compositeTypeFields: ReturnType<typeof collectCompositeTypeFields>,
  saImports: Set<string>,
): string[] {
  const tableArgEntries: string[] = [];
  let hasIndex = false;
  let hasUniqueConstraint = false;

  for (const ct of compositeTypeFields) {
    const cols = ct.columns.map((column) => pythonStringLiteral(column)).join(", ");
    // SQLAlchemy's UniqueConstraint has no partial-predicate option, so a
    // partial UNIQUE has to be expressed as `Index(..., unique=True, postgresql_where=...)`.
    if ((ct.isPrimary || ct.isUnique) && !ct.where) {
      hasUniqueConstraint = true;
      tableArgEntries.push(
        `${FOUR_SPACES}${FOUR_SPACES}UniqueConstraint(${cols}, name=${pythonStringLiteral(ct.name)})`,
      );
      continue;
    }

    hasIndex = true;
    const args = [pythonStringLiteral(ct.name), cols];
    if (ct.isUnique || ct.isPrimary) args.push("unique=True");
    if (ct.where) {
      saImports.add("sqlalchemy.text");
      args.push(`postgresql_where=text(${pythonStringLiteral(ct.where)})`);
    }
    tableArgEntries.push(`${FOUR_SPACES}${FOUR_SPACES}Index(${args.join(", ")})`);
  }

  if (hasIndex) saImports.add("sqlalchemy.Index");
  if (hasUniqueConstraint) saImports.add("sqlalchemy.UniqueConstraint");
  return tableArgEntries;
}

function addIndexUsingEntries(
  program: Program,
  model: Model,
  saImports: Set<string>,
  tableArgEntries: string[],
): void {
  const tableName = getTableName(program, model);
  for (const prop of walkPropertiesInherited(model)) {
    const method = getIndexUsing(program, prop);
    if (!method) continue;
    if (!isIndex(program, prop) && !isUnique(program, prop) && !isKey(program, prop)) continue;
    const columnName = getColumnName(program, prop);
    const idxName = `${tableName}_${columnName}_${method}_idx`;
    saImports.add("sqlalchemy.Index");
    const args = [
      JSON.stringify(idxName),
      JSON.stringify(columnName),
      `postgresql_using=${JSON.stringify(method)}`,
    ];
    if (isUnique(program, prop)) {
      args.push("unique=True");
    }
    const predicate = getPartialIndex(program, prop);
    if (predicate) {
      saImports.add("sqlalchemy.text");
      args.push(`postgresql_where=text(${pythonStringLiteral(predicate)})`);
    }
    tableArgEntries.push(`${FOUR_SPACES}${FOUR_SPACES}Index(${args.join(", ")})`);
  }
}

/**
 * Emit field-level partial indexes for properties that carry `@partialIndex`
 * but no `@indexUsing` (the `@indexUsing` path already inlines the predicate).
 */
function addPartialIndexEntries(
  program: Program,
  model: Model,
  saImports: Set<string>,
  tableArgEntries: string[],
): void {
  const tableName = getTableName(program, model);
  for (const prop of walkPropertiesInherited(model)) {
    const predicate = getPartialIndex(program, prop);
    if (!predicate) continue;
    if (getIndexUsing(program, prop)) continue;
    const indexed = isIndex(program, prop);
    const unique = isUnique(program, prop);
    const isPrimaryKey = isKey(program, prop);
    if (!indexed && !unique && !isPrimaryKey) continue;
    const columnName = getColumnName(program, prop);
    const suffix = unique ? "unique" : "idx";
    const idxName = `${tableName}_${columnName}_${suffix}`;
    saImports.add("sqlalchemy.Index");
    saImports.add("sqlalchemy.text");
    const args = [JSON.stringify(idxName), JSON.stringify(columnName)];
    if (unique) args.push("unique=True");
    args.push(`postgresql_where=text(${pythonStringLiteral(predicate)})`);
    tableArgEntries.push(`${FOUR_SPACES}${FOUR_SPACES}Index(${args.join(", ")})`);
  }
}

function addCheckConstraints(
  program: Program,
  model: Model,
  saImports: Set<string>,
  tableArgEntries: string[],
): void {
  for (const prop of walkPropertiesInherited(model)) {
    const check = getCheck(program, prop);
    if (check) {
      saImports.add("sqlalchemy.CheckConstraint");
      tableArgEntries.push(
        `${FOUR_SPACES}${FOUR_SPACES}CheckConstraint(${JSON.stringify(check.expression)}, name=${JSON.stringify(check.name)})`,
      );
    }

    const polymorphic = getPolymorphicConfig(program, prop);
    if (polymorphic && polymorphic.allowedTypes.length > 0) {
      const columnName = getColumnName(program, prop);
      const tableName = getTableName(program, model);
      if (polymorphic.check) {
        const checkName = `${tableName}_${columnName}_polymorphic`;
        const valuesList = polymorphic.allowedTypes
          .map((value) => `'${value.replaceAll("'", "''")}'`)
          .join(", ");
        const expression = `${columnName} IN (${valuesList})`;
        saImports.add("sqlalchemy.CheckConstraint");
        tableArgEntries.push(
          `${FOUR_SPACES}${FOUR_SPACES}CheckConstraint(${JSON.stringify(expression)}, name=${JSON.stringify(checkName)})`,
        );
      }
      if (polymorphic.idColumn) {
        saImports.add("sqlalchemy.Index");
        const idColumnName = camelToSnake(polymorphic.idColumn);
        const idxName = `${tableName}_${columnName}_${idColumnName}_idx`;
        tableArgEntries.push(
          `${FOUR_SPACES}${FOUR_SPACES}Index(${JSON.stringify(idxName)}, ${JSON.stringify(columnName)}, ${JSON.stringify(idColumnName)})`,
        );
      }
    }
  }
}

export function addEnumImports(
  enumTypes: ReturnType<typeof classifyProperties>["enumTypes"],
  stdImports: Set<string>,
  saImports: Set<string>,
): void {
  if (enumTypes.size === 0) {
    return;
  }

  stdImports.add("enum.Enum");
  saImports.add("sqlalchemy.Enum as SAEnum");
}
