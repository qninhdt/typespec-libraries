/**
 * ZodModelFile - generates a separate Zod schema file for each model.
 */

import { Children } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/typescript";
import {
  walkPropertiesInherited,
  type Enum,
  type Model,
  type Program,
  type Type,
  type Union,
} from "@typespec/compiler";
import {
  generatedHeader,
  getInputTypeForProperty,
  getPlaceholder,
  getTitle,
} from "@qninhdt/typespec-orm";
import { ZodSchemaDeclaration } from "./ZodSchemaDeclaration.js";
import { shouldReference, toPascalCase } from "../utils.js";

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
  const referencedDeclarations = collectReferencedDeclarations(
    props.program,
    props.model,
    schemaName,
  );
  const metadataEntries = [...walkPropertiesInherited(props.model)]
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
      {referencedDeclarations.map((declaration) => (
        <>
          <ZodSchemaDeclaration type={declaration.type} name={declaration.schemaName} />
          {"\n"}
        </>
      ))}
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

type ReferencedDeclarationType = Enum | Model | Union;

interface ReferencedDeclaration {
  readonly type: ReferencedDeclarationType;
  readonly schemaName: string;
}

function collectReferencedDeclarations(
  program: Program,
  root: Model,
  rootSchemaName: string,
): ReferencedDeclaration[] {
  const seen = new Set<Type>();
  const declarations = new Map<string, ReferencedDeclarationType>();

  function visit(current: Type): void {
    if (seen.has(current)) {
      return;
    }
    seen.add(current);

    switch (current.kind) {
      case "Enum":
        declarations.set(getDeclarationKey(current), current);
        return;
      case "Model":
        if (current.baseModel) visit(current.baseModel);
        if (current.indexer) {
          visit(current.indexer.key);
          visit(current.indexer.value);
        }
        for (const prop of walkPropertiesInherited(current)) {
          visit(prop.type);
        }
        if (current !== root && shouldReference(program, current)) {
          declarations.set(getDeclarationKey(current), current);
        }
        return;
      case "Union":
        for (const variant of current.variants.values()) {
          visit(variant.kind === "UnionVariant" ? variant.type : variant);
        }
        if (shouldReference(program, current)) {
          declarations.set(getDeclarationKey(current), current);
        }
        return;
      case "UnionVariant":
        visit(current.type);
        return;
      case "Tuple":
        for (const value of current.values) {
          visit(value);
        }
        return;
      case "Scalar":
        if (current.baseScalar) visit(current.baseScalar);
        return;
    }
  }

  visit(root);
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
