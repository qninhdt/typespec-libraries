/**
 * ZodModelFile - generates a separate Zod schema file for each model.
 */

import { Children } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/typescript";
import { Model, Program } from "@typespec/compiler";
import {
  generatedHeader,
  getInputTypeForProperty,
  getPlaceholder,
  getTitle,
} from "@qninhdt/typespec-orm";
import { ZodSchemaDeclaration } from "./ZodSchemaDeclaration.js";
import { toPascalCase } from "../utils.js";

export interface ZodModelFileProps {
  readonly program: Program;
  readonly model: Model;
  readonly label: string;
  readonly path?: string;
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
  const metaName = pascalName + "Meta";
  const filePath = props.path ?? `${name}.ts`;
  const metadataEntries = [...props.model.properties.values()]
    .map((prop) => {
      const title = getTitle(props.program, prop);
      const placeholder = getPlaceholder(props.program, prop);
      const inputType = getInputTypeForProperty(props.program, prop);
      const parts = [
        title ? `title: ${JSON.stringify(title)}` : undefined,
        placeholder ? `placeholder: ${JSON.stringify(placeholder)}` : undefined,
        inputType ? `inputType: ${JSON.stringify(inputType)}` : undefined,
      ].filter((item): item is string => !!item);

      if (parts.length === 0) {
        return undefined;
      }

      return `  ${renderPropertyName(prop.name)}: { ${parts.join(", ")} },`;
    })
    .filter((item): item is string => !!item);

  return (
    <SourceFile path={filePath}>
      {`// ${generatedHeader}\n`}
      <ZodSchemaDeclaration type={props.model} name={schemaName} export />
      {`\nexport type ${pascalName} = z.infer<typeof ${schemaName}>;\n`}
      {metadataEntries.length > 0
        ? `\nexport const ${metaName} = {\n${metadataEntries.join("\n")}\n} as const;\n`
        : ""}
    </SourceFile>
  );
}

function renderPropertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}
