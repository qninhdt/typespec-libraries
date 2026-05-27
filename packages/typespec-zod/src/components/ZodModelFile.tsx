/**
 * ZodModelFile - generates a separate Zod schema file for each model.
 */

import { Children } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/typescript";
import { type Model, type Program } from "@typespec/compiler";
import {
  generatedHeader,
  getInputTypeForProperty,
  getPlaceholder,
  getTitle,
} from "@qninhdt/typespec-orm";
import { ZodSchemaDeclaration } from "./ZodSchemaDeclaration.js";
import { getModelOwnProperties, toPascalCase } from "../utils.js";
import { buildMetaEntry, FORM_FIELD_META_INTERFACE_NAME } from "./meta-builder.js";
import { collectReferencedDeclarations } from "./referenced-declarations.js";

export interface ZodModelFileProps {
  readonly program: Program;
  readonly model: Model;
  readonly label: string;
  readonly path?: string;
  readonly namespaceDir?: string;
}

/**
 * Generates a separate Zod schema file for each data model.
 * Each file contains:
 * - const ClassSchema = z.object({...})
 * - const ClassMeta = { field: { ...FormFieldMeta }, ... }
 */
export function ZodModelFile(props: ZodModelFileProps): Children {
  // Convert to PascalCase for schema name
  const name = props.model.name!;
  const pascalName = toPascalCase(name);
  const schemaName = pascalName + "Schema";
  const metaName = pascalName + "Meta";
  const filePath = props.path ?? `${name}.ts`;
  const referencedDeclarations = collectReferencedDeclarations(
    props.program,
    props.model,
    schemaName,
  );
  const metadataEntries = getModelOwnProperties(props.model)
    .map((prop) => {
      const entry = buildMetaEntry(props.program, prop);
      if (!entry) return undefined;
      return `  ${renderPropertyName(prop.name)}: ${entry},`;
    })
    .filter((item): item is string => !!item);
  const metaImportPath = buildMetaImportPath(props.namespaceDir);

  return (
    <SourceFile path={filePath}>
      {`// ${generatedHeader}\n`}
      {metadataEntries.length > 0
        ? `import type { ${FORM_FIELD_META_INTERFACE_NAME} } from "${metaImportPath}";\n`
        : ""}
      {referencedDeclarations.map((declaration) => (
        <>
          <ZodSchemaDeclaration type={declaration.type} name={declaration.schemaName} />
          {"\n"}
        </>
      ))}
      <ZodSchemaDeclaration type={props.model} name={schemaName} export />
      {`\nexport type ${pascalName} = z.infer<typeof ${schemaName}>;\n`}
      {metadataEntries.length > 0
        ? `\nexport const ${metaName}: Record<string, ${FORM_FIELD_META_INTERFACE_NAME}> = {\n${metadataEntries.join("\n")}\n};\nexport type ${metaName}Shape = typeof ${metaName};\nexport type ${metaName}Type = ${metaName}Shape;\n`
        : ""}
    </SourceFile>
  );
}

/**
 * Suppress legacy uses; placeholder/title/inputType are now read by
 * the meta-builder module so this file stays focused on file shape.
 */
void getTitle;
void getPlaceholder;
void getInputTypeForProperty;

function renderPropertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function buildMetaImportPath(namespaceDir: string | undefined): string {
  if (!namespaceDir) return "./_meta.js";
  const depth = namespaceDir.split("/").filter((segment) => segment.length > 0).length;
  return `${"../".repeat(depth)}_meta.js`;
}
