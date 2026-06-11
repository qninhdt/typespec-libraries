/**
 * Resolves the set of types referenced from a model and assigns each one a
 * unique Zod schema identifier. Used by `ZodModelFile` to inline private
 * declarations into a model's emitted file without name collisions.
 */

import { type Enum, type Model, type Program, type Scalar, type Union } from "@typespec/compiler";
import { isData } from "@qninhdt/typespec-orm";
import { shouldReference, toPascalCase } from "../utils.js";
import { walkReferencedTypes } from "../traversal.js";

export type ReferencedDeclarationType = Enum | Model | Scalar | Union;

export interface ReferencedDeclaration {
  readonly type: ReferencedDeclarationType;
  readonly schemaName: string;
}

export function collectReferencedDeclarations(
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
