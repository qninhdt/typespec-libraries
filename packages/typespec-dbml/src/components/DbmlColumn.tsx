/**
 * DbmlColumn - DBML column generation.
 */

import type { ModelProperty, Program, Enum } from "@typespec/compiler";
import {
  getCheck,
  getColumnName,
  isKey,
  isAutoIncrement,
  isAutoCreateTime,
  isAutoUpdateTime,
  isSoftDelete,
  isIgnored,
  isEnum,
  getPrecision,
  getDoc,
  getMaxLength,
} from "@qninhdt/typespec-orm";
import { getDbmlType, formatColumnSettings, type ColumnSettings } from "./DbmlConstants.js";

export function generateColumnLine(program: Program, prop: ModelProperty): string {
  // Skip ignored properties
  if (isIgnored(program, prop)) {
    return "";
  }

  const columnName = getColumnName(program, prop);

  // Handle enum types - use enum name directly
  if (isEnum(prop.type)) {
    const enumName = (prop.type as Enum).name;
    const settings: ColumnSettings = {};

    const doc = getDoc(program, prop);
    const check = getCheck(program, prop);
    settings.note = joinNotes(doc, check ? `check ${check.name}: ${check.expression}` : undefined);

    const settingsStr = formatColumnSettings(settings);
    return `  ${columnName} ${enumName}${settingsStr}`;
  }

  const dbmlType = getDbmlType(program, prop.type);

  if (!dbmlType) {
    return "";
  }

  // Build column settings
  const settings: ColumnSettings = {};

  // Primary key
  if (isKey(program, prop)) {
    settings.pk = true;
  }

  // Auto increment
  if (isAutoIncrement(program, prop)) {
    settings.increment = true;
  }

  // Handle string length
  let typeStr = dbmlType;
  if (dbmlType === "varchar") {
    const maxLength = getMaxLength(program, prop) ?? 255;
    typeStr = `varchar(${maxLength})`;
  }

  // Handle decimal precision
  if (dbmlType === "decimal") {
    const precision = getPrecision(program, prop);
    if (precision) {
      typeStr = `decimal(${precision.precision}, ${precision.scale ?? 0})`;
    } else {
      typeStr = "decimal";
    }
  }

  // Handle auto timestamps
  if (isAutoCreateTime(program, prop) || isAutoUpdateTime(program, prop)) {
    settings.default = "now()";
  }

  // Determine nullability:
  // - optional properties are nullable
  // - soft-delete columns are nullable (deleted_at starts as NULL)
  // - everything else is NOT NULL by default
  if (prop.optional) {
    settings.notNull = false;
    delete settings.pk;
    delete settings.increment;
  } else if (isSoftDelete(program, prop)) {
    // soft-delete columns (e.g. deleted_at) start as NULL
    settings.notNull = false;
  } else {
    settings.notNull = true;
  }

  const doc = getDoc(program, prop);
  const check = getCheck(program, prop);
  settings.note = joinNotes(doc, check ? `check ${check.name}: ${check.expression}` : undefined);

  const settingsStr = formatColumnSettings(settings);

  return `  ${columnName} ${typeStr}${settingsStr}`;
}

function joinNotes(...parts: Array<string | undefined>): string | undefined {
  const defined = parts.filter((item): item is string => !!item);
  return defined.length > 0 ? defined.join(" | ") : undefined;
}
