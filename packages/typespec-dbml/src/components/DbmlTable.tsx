/**
 * DbmlTable - Generate DBML table definitions.
 */

import type { Model, Program } from "@typespec/compiler";
import {
  classifyProperties,
  getCompositeFields,
  isKey,
  isUnique,
  isIndex,
  camelToSnake,
  getColumnName,
  getDoc,
} from "@qninhdt/typespec-orm";
import { generateColumnLine } from "./DbmlColumn.jsx";

export interface DbmlTableProps {
  readonly program: Program;
  readonly model: Model;
  readonly tableName: string;
}

/**
 * JSX component: generates a DBML table definition.
 */
export function DbmlTable(props: DbmlTableProps): string {
  const { program, model, tableName } = props;

  const { ignored, fields: regularProps } = classifyProperties(program, model);

  const lines: string[] = [];
  const indexes: string[] = [];

  // Generate columns (all fields including enum types)
  for (const { prop } of regularProps) {
    const colLine = generateColumnLine(program, prop);
    if (colLine) {
      lines.push(colLine);
    }
  }

  // Add ignored fields as notes (optional)
  for (const { prop } of ignored) {
    const doc = getDoc(program, prop);
    if (doc) {
      lines.push(`  // ${doc}`);
    }
  }

  // Collect composite type fields for indexes
  const compositeFields: {
    name: string;
    columns: string[];
    isUnique: boolean;
    isPrimary: boolean;
  }[] = [];

  for (const [, prop] of model.properties) {
    const columns = getCompositeFields(program, prop);
    if (columns) {
      compositeFields.push({
        name: prop.name,
        columns,
        isUnique: isUnique(program, prop),
        isPrimary: isKey(program, prop),
      });
    }
  }

  indexes.push(...compositeFields.map(buildCompositeIndexLine));

  // Add single-column indexes and unique constraints
  for (const { prop } of regularProps) {
    // Skip composite type configuration properties
    if (getCompositeFields(program, prop)) continue;

    const colName = camelToSnake(getColumnName(program, prop));

    if (isIndex(program, prop) && !isUnique(program, prop)) {
      indexes.push(`    ${colName}`);
    } else if (isUnique(program, prop) && !isKey(program, prop)) {
      indexes.push(`    ${colName} [unique]`);
    }
  }

  const tableLines = [`Table ${tableName} {`, ...lines];
  if (indexes.length > 0) {
    tableLines.push("", "  indexes {", ...indexes, "  }");
  }
  tableLines.push("}");

  return tableLines.join("\n");
}

function buildCompositeIndexLine(ct: {
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}): string {
  const snakeColumns = ct.columns.map((column) => camelToSnake(column));
  let suffix = "";
  if (ct.isPrimary) {
    suffix = " [pk]";
  } else if (ct.isUnique) {
    suffix = " [unique]";
  }
  return `    (${snakeColumns.join(", ")})${suffix}`;
}
