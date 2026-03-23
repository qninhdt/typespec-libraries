/**
 * DbmlColumn - DBML column generation.
 */

import type { ModelProperty, Program, Enum } from "@typespec/compiler";
import {
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

    // Add documentation as note
    const doc = getDoc(program, prop);
    if (doc) {
      settings.note = doc;
    }

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
    // Add default for timestamps
    settings.default = "now()";
    settings.notNull = true;
  }

  // Soft delete is nullable
  if (!isSoftDelete(program, prop)) {
    settings.notNull = true;
  }

  // Check if optional (nullable)
  if (prop.optional) {
    settings.notNull = false;
    delete settings.pk;
    delete settings.increment;
  }

  // Add documentation as note
  const doc = getDoc(program, prop);
  if (doc) {
    settings.note = doc;
  }

  const settingsStr = formatColumnSettings(settings);

  return `  ${columnName} ${typeStr}${settingsStr}`;
}
