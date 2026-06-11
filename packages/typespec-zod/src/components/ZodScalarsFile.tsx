/**
 * ZodScalarsFile - generates a shared _scalars.ts file for custom scalar declarations.
 */

import { Children } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/typescript";
import { type Model, type Program, type Scalar } from "@typespec/compiler";
import { generatedHeader, getNamespaceSegments, getTypeFullName } from "@qninhdt/typespec-orm";
import { ZodSchemaDeclaration } from "./ZodSchemaDeclaration.js";
import { shouldReference, toPascalCase } from "../utils.js";
import { walkReferencedTypes } from "../traversal.js";

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

  for (const model of models) {
    walkReferencedTypes(model, (type) => {
      if (type.kind === "Scalar" && shouldReference(program, type)) {
        scalars.set(getTypeFullName(program, type), type);
      }
    });
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
