/**
 * ZodScalarsFile - generates a shared _scalars.ts file for custom scalar declarations.
 */

import { Children } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/typescript";
import {
  walkPropertiesInherited,
  type Model,
  type Program,
  type Scalar,
  type Type,
} from "@typespec/compiler";
import { generatedHeader, getNamespaceSegments, getTypeFullName } from "@qninhdt/typespec-orm";
import { ZodSchemaDeclaration } from "./ZodSchemaDeclaration.js";
import { shouldReference, toPascalCase } from "../utils.js";

export interface ZodScalarsFileProps {
  readonly program: Program;
  readonly scalars: Scalar[];
  readonly path?: string;
}

export function ZodScalarsFile(props: ZodScalarsFileProps): Children {
  if (props.scalars.length === 0) return undefined;
  const schemaNames = buildScalarSchemaNames(props.program, props.scalars);

  return (
    <SourceFile path={props.path ?? "_scalars.ts"}>
      {`// ${generatedHeader}\n`}
      {props.scalars.map((scalar) => (
        <>
          <ZodSchemaDeclaration type={scalar} name={schemaNames.get(scalar)} export />
          {"\n"}
        </>
      ))}
    </SourceFile>
  );
}

export function collectScalarsForModels(program: Program, models: readonly Model[]): Scalar[] {
  const scalars = new Map<string, Scalar>();
  const seen = new Set<Type>();

  function visit(type: Type): void {
    if (seen.has(type)) return;
    seen.add(type);

    if (type.kind === "Scalar") {
      if (shouldReference(program, type)) {
        scalars.set(getTypeFullName(program, type), type);
      }
      if (type.baseScalar) visit(type.baseScalar);
      return;
    }

    if (type.kind === "Model") {
      if (type.baseModel) visit(type.baseModel);
      if (type.indexer) {
        visit(type.indexer.key);
        visit(type.indexer.value);
      }
      for (const prop of walkPropertiesInherited(type)) {
        visit(prop.type);
      }
      return;
    }

    if (type.kind === "Union") {
      for (const variant of type.variants.values()) {
        visit(variant.kind === "UnionVariant" ? variant.type : variant);
      }
      return;
    }

    if (type.kind === "UnionVariant") {
      visit(type.type);
      return;
    }

    if (type.kind === "Tuple") {
      for (const value of type.values) {
        visit(value);
      }
    }
  }

  for (const model of models) {
    visit(model);
  }

  return [...scalars.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, scalar]) => scalar);
}

function buildScalarSchemaNames(program: Program, scalars: readonly Scalar[]): Map<Scalar, string> {
  const nameCounts = scalars.reduce((counts, scalar) => {
    counts.set(scalar.name, (counts.get(scalar.name) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  return scalars.reduce((names, scalar) => {
    const hasCollision = (nameCounts.get(scalar.name) ?? 0) > 1;
    const baseName = hasCollision
      ? `${getNamespaceSegments(scalar.namespace, program.getGlobalNamespaceType())
          .map(toPascalCase)
          .join("")}${toPascalCase(scalar.name)}`
      : scalar.name;
    names.set(scalar, `${baseName}Schema`);
    return names;
  }, new Map<Scalar, string>());
}
