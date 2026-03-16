/**
 * DbmlFile - Top-level JSX component for DBML file generation.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, Program } from "@typespec/compiler";
import { classifyProperties } from "@qninhdt/typespec-orm";
import { DbmlTable } from "./DbmlTable.jsx";
import { generateEnumDefinition } from "./DbmlEnum.jsx";
import { generateRelationFields } from "./DbmlRelationField.jsx";

export interface DbmlFileProps {
  readonly program: Program;
  readonly model: Model;
  readonly tableName: string;
  readonly allTables?: { model: Model; tableName: string }[];
}

/**
 * JSX component: renders a complete DBML file for a table model.
 */
export function DbmlFile(props: DbmlFileProps): Children {
  const { program, model, tableName } = props;

  // Get all enums used by this table
  const { enumTypes, relations } = classifyProperties(program, model);

  // Build table definition
  const tableDef = DbmlTable({ program, model, tableName });

  // Generate references from relations
  const refs = generateRelationFields(program, relations, tableName);

  // Build file content using array for better performance
  const codeParts: string[] = ["// Database Schema", ""];

  // Add enum definitions
  for (const [enumName, members] of enumTypes) {
    codeParts.push(generateEnumDefinition(enumName, members), "");
  }

  // Add table definition
  codeParts.push(tableDef, "");

  // Add references
  for (const ref of refs) {
    codeParts.push(ref);
  }

  const code = codeParts.join("\n");

  const fileName = `${tableName}.dbml`;

  return (
    <SourceFile path={fileName} filetype="dbml" printWidth={9999}>
      {code}
    </SourceFile>
  );
}
