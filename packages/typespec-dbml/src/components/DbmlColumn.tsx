/**
 * DbmlColumn - DBML column generation.
 */

import type { ModelProperty, Program, Enum } from "@typespec/compiler";
import {
  getCheck,
  getColumnName,
  getCompositeFields,
  isKey,
  isAutoCreateTime,
  isAutoUpdateTime,
  isAutoIncrement,
  isSoftDelete,
  isIgnored,
  isEnum,
  isUnique,
  getPrecision,
  getDoc,
  getMaxLength,
  getDefaultValue,
  getDefaultExpression,
  getEnumMembers,
  UniqueKey,
} from "@qninhdt/typespec-orm";
import {
  getDbmlType,
  formatColumnSettings,
  quoteDbmlIdentifier,
  type ColumnSettings,
} from "./DbmlConstants.js";
import { reportDiagnostic } from "../lib.js";

/**
 * `@unique` carries a name override iff `program.stateMap(UniqueKey).get(prop)`
 * is a non-empty string. An empty string means the decorator was applied
 * without a name (P1 added the `name?` parameter), and we let the auto-derived
 * unique-constraint name flow through the indexes block.
 */
export function hasUniqueNameOverride(program: Program, prop: ModelProperty): boolean {
  const stored = program.stateMap(UniqueKey).get(prop);
  return typeof stored === "string" && stored !== "";
}

export function generateColumnLine(program: Program, prop: ModelProperty): string {
  // Skip ignored properties
  if (isIgnored(program, prop)) {
    return "";
  }

  const columnName = quoteDbmlIdentifier(getColumnName(program, prop));

  // Handle enum types - use enum name directly
  if (isEnum(prop.type)) {
    const enumType = prop.type as Enum;
    const enumName = enumType.name;
    const settings: ColumnSettings = {};

    const doc = getDoc(program, prop);
    const check = getCheck(program, prop);
    const defaultValue = getDefaultValue(program, prop);
    if (defaultValue !== undefined) {
      const resolved = resolveEnumDefault(program, prop, enumType, defaultValue);
      if (resolved !== undefined) {
        settings.default = resolved;
      }
    }
    if (!prop.optional) {
      settings.notNull = true;
    }
    settings.note = joinNotes(
      doc,
      check
        ? `check ${check.name}: ${rewriteCheckExpression(program, prop, check.expression)}`
        : undefined,
    );

    const settingsStr = formatColumnSettings(settings);
    return `  ${columnName} ${enumName}${settingsStr}`;
  }

  const dbmlType = getDbmlType(program, prop.type);

  if (!dbmlType) {
    if (!getCompositeFields(program, prop)) {
      reportDiagnostic(program, {
        code: "unsupported-type",
        target: prop,
      });
    }
    return "";
  }

  // Build column settings
  const settings: ColumnSettings = {};

  // Primary key
  if (isKey(program, prop)) {
    settings.pk = true;
  }
  if (isAutoIncrement(program, prop)) {
    settings.increment = true;
  }

  const typeStr = resolveColumnType(program, prop, dbmlType);

  // Handle auto timestamps
  if (isAutoCreateTime(program, prop) || isAutoUpdateTime(program, prop)) {
    settings.default = "now()";
  } else {
    const expr = getDefaultExpression(program, prop);
    if (expr !== undefined) {
      settings.default = expr;
    } else {
      const defaultValue = getDefaultValue(program, prop);
      if (defaultValue !== undefined) {
        settings.default = defaultValue;
      }
    }
  }

  // Determine nullability:
  // - optional properties are nullable
  // - soft-delete columns are nullable (deleted_at starts as NULL)
  // - everything else is NOT NULL by default
  if (prop.optional) {
    settings.notNull = false;
    delete settings.pk;
  } else if (isSoftDelete(program, prop)) {
    // soft-delete columns (e.g. deleted_at) start as NULL
    settings.notNull = false;
  } else if (!settings.pk) {
    // pk implies not null in DBML, so don't repeat
    settings.notNull = true;
  }

  // Single-column `@unique` (without a name override) renders as a column-level
  // `[unique]` so dbdiagram.io shows the inline badge. When a name is given via
  // `@unique("uq_email")` the constraint name only survives in the indexes
  // block (DBML has no per-column name surface), so we keep the indexes-block
  // form there and DON'T add `[unique]` to the column.
  if (isUnique(program, prop) && !isKey(program, prop) && !hasUniqueNameOverride(program, prop)) {
    settings.unique = true;
  }

  const doc = getDoc(program, prop);
  const check = getCheck(program, prop);
  settings.note = joinNotes(
    doc,
    check
      ? `check ${check.name}: ${rewriteCheckExpression(program, prop, check.expression)}`
      : undefined,
  );

  const settingsStr = formatColumnSettings(settings);

  return `  ${columnName} ${typeStr}${settingsStr}`;
}

function resolveColumnType(program: Program, prop: ModelProperty, dbmlType: string): string {
  const isArray = dbmlType.endsWith("[]");
  const baseType = isArray ? dbmlType.slice(0, -2) : dbmlType;
  const suffix = isArray ? "[]" : "";

  if (baseType === "text" || baseType === "varchar") {
    const maxLength = getMaxLength(program, prop);
    if (maxLength !== undefined) {
      return `varchar(${maxLength})${suffix}`;
    }
    return `${baseType}${suffix}`;
  }

  if (baseType === "numeric" || baseType === "decimal") {
    const precision = getPrecision(program, prop);
    if (precision) {
      return `${baseType}(${precision.precision}, ${precision.scale ?? 0})${suffix}`;
    }
  }

  return dbmlType;
}

function joinNotes(...parts: Array<string | undefined>): string | undefined {
  const defined = parts.filter((item): item is string => !!item);
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];
  // Multiple sources (e.g. doc + check) used to be glued together with `|`,
  // which read as ad-hoc syntax in the rendered diagram. Embed a real newline
  // instead — `formatDbmlNote` will pick the triple-quoted form because the
  // result contains a newline.
  return defined.join("\n");
}

/**
 * Rewrite TypeSpec property names in a `@check` expression to their resolved
 * column names so the rendered note matches the actual schema. Without this,
 * `@check("c", "monthlyPrice >= 0")` on a column mapped to `monthly_price`
 * leaks the source-code identifier into a note that purports to describe the
 * DB-level constraint.
 *
 * Implementation: tokenize on word boundaries and replace any token that
 * matches a sibling property's TypeSpec name with its column name. Numeric
 * literals, operators, and unrelated identifiers (functions, casts) pass
 * through unchanged.
 */
function rewriteCheckExpression(program: Program, prop: ModelProperty, expression: string): string {
  const owner = prop.model;
  if (!owner) return expression;
  const propMap = new Map<string, ModelProperty>();
  for (const sibling of owner.properties.values()) {
    propMap.set(sibling.name, sibling);
  }
  return expression.replace(/[A-Za-z_][\w]*/g, (token) => {
    const sibling = propMap.get(token);
    if (!sibling) return token;
    return getColumnName(program, sibling);
  });
}

function resolveEnumDefault(
  program: Program,
  prop: ModelProperty,
  enumType: Enum,
  defaultValue: string,
): string | undefined {
  const members = getEnumMembers(enumType);
  // Match by member name (canonical) first, then by stringified member value.
  const byName = members.find((m) => m.name === defaultValue);
  if (byName) return byName.name;
  const byValue = members.find((m) => m.value === defaultValue);
  if (byValue) return byValue.name;

  reportDiagnostic(program, {
    code: "invalid-enum-default",
    target: prop,
    format: {
      value: defaultValue,
      enumName: enumType.name,
      members: members.map((m) => m.name).join(", ") || "(none)",
    },
  });
  return undefined;
}
