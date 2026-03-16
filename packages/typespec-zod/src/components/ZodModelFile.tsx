/**
 * ZodModelFile - generates a separate Zod schema file for each model.
 */

import { Children } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/typescript";
import { Model, Program } from "@typespec/compiler";
import { generatedHeader } from "@qninhdt/typespec-orm";
import { ZodSchemaDeclaration } from "./ZodSchemaDeclaration.js";

export interface ZodModelFileProps {
  program: Program;
  model: Model;
  label: string;
  modelsFolder?: boolean;
}

/**
 * Converts a string to PascalCase
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}

/**
 * Generates a separate Zod schema file for each data model.
 * Each file contains:
 * - const ClassSchema = z.object({...})
 */
export function ZodModelFile(props: ZodModelFileProps): Children {
  // Convert to PascalCase for schema name
  const name = props.model.name!;
  const pascalName = toPascalCase(name);
  const schemaName = pascalName + "Schema";

  const filePath = props.modelsFolder ? `../models/${name}.ts` : `${name}.ts`;

  return (
    <SourceFile path={filePath}>
      {`// ${generatedHeader}\n`}
      <ZodSchemaDeclaration type={props.model} name={schemaName} export />
    </SourceFile>
  );
}
