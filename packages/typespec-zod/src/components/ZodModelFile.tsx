/**
 * ZodModelFile - generates a separate Zod schema file for each model.
 */

import { Children } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/typescript";
import { type Enum, type Model, type Program, type Scalar, type Union } from "@typespec/compiler";
import {
  generatedHeader,
  getInputTypeForProperty,
  getPlaceholder,
  getTitle,
  isData,
} from "@qninhdt/typespec-orm";
import { ZodSchemaDeclaration } from "./ZodSchemaDeclaration.js";
import { getModelOwnProperties, shouldReference, toPascalCase } from "../utils.js";
import { walkReferencedTypes } from "../traversal.js";
import { buildMetaEntry, FORM_FIELD_META_INTERFACE_NAME } from "./meta-builder.js";

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

  return (
    <SourceFile path={filePath}>
      {`// ${generatedHeader}\n`}
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

type ReferencedDeclarationType = Enum | Model | Scalar | Union;

interface ReferencedDeclaration {
  readonly type: ReferencedDeclarationType;
  readonly schemaName: string;
}

function collectReferencedDeclarations(
  program: Program,
  root: Model,
  rootSchemaName: string,
): ReferencedDeclaration[] {
  const declarations = new Map<string, ReferencedDeclarationType>();

  walkReferencedTypes(root, (current) => {
    switch (current.kind) {
      case "Enum":
        if (shouldReference(program, current)) {
          declarations.set(getDeclarationKey(current), current);
        }
        return;
      case "Model":
        if (current !== root && shouldReference(program, current) && !isData(program, current)) {
          declarations.set(getDeclarationKey(current), current);
        }
        return;
      case "Union":
        if (shouldReference(program, current)) {
          declarations.set(getDeclarationKey(current), current);
        }
        return;
      // Scalars are declared in _scalars.ts, not inlined in model files.
    }
  });

  return buildDeclarationNames([...declarations.values()], rootSchemaName);
}

function buildDeclarationNames(
  declarations: ReferencedDeclarationType[],
  rootSchemaName: string,
): ReferencedDeclaration[] {
  const baseNameCounts = declarations.reduce((counts, declaration) => {
    const baseName = getBaseSchemaName(declaration);
    counts.set(baseName, (counts.get(baseName) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const usedNames = new Set([rootSchemaName]);

  return declarations.map((type) => {
    const baseName = getBaseSchemaName(type);
    const needsQualifiedName = baseNameCounts.get(baseName)! > 1 || usedNames.has(baseName);
    let schemaName = needsQualifiedName ? getQualifiedSchemaName(type) : baseName;

    for (let suffix = 2; usedNames.has(schemaName); suffix++) {
      schemaName = `${needsQualifiedName ? getQualifiedSchemaName(type) : baseName}${suffix}`;
    }

    usedNames.add(schemaName);
    return { type, schemaName };
  });
}

function getDeclarationKey(type: ReferencedDeclarationType): string {
  return `${type.kind}:${getDeclarationFullName(type)}`;
}

function getDeclarationFullName(type: ReferencedDeclarationType): string {
  return [...getNamespaceSegments(type), type.name].join(".");
}

function getBaseSchemaName(type: ReferencedDeclarationType): string {
  return `${type.name}Schema`;
}

function getQualifiedSchemaName(type: ReferencedDeclarationType): string {
  const namespacePrefix = getNamespaceSegments(type).map(toPascalCase).join("");
  return `${namespacePrefix}${type.name}Schema`;
}

function getNamespaceSegments(type: ReferencedDeclarationType): string[] {
  const segments: string[] = [];
  let namespace = type.namespace;

  while (namespace && namespace.name !== "") {
    segments.unshift(namespace.name);
    namespace = namespace.namespace;
  }

  return segments;
}
