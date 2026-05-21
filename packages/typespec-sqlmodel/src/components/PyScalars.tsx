import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, Program, Scalar } from "@typespec/compiler";
import {
  camelToPascal,
  generatedHeader,
  getNamespaceSegments,
  getTypeFullName,
} from "@qninhdt/typespec-orm";
import { buildPythonImportBlock } from "./PyConstants.js";
import { collectAliasableCustomScalars, generateScalarAlias } from "./py-field-utils.js";

export interface PyScalarsFileProps {
  readonly program: Program;
  readonly scalars: readonly Scalar[];
  readonly aliasNames: ReadonlyMap<Scalar, string>;
  readonly path?: string;
}

export function PyScalarsFile(props: PyScalarsFileProps): Children {
  if (props.scalars.length === 0) return null;

  const stdImports = new Set<string>();
  const pydanticImports = new Set<string>();
  const aliases = props.scalars.map((scalar) =>
    generateScalarAlias(
      props.program,
      scalar,
      stdImports,
      pydanticImports,
      props.aliasNames.get(scalar) ?? scalar.name,
    ),
  );

  let code = `# ${generatedHeader}\n`;
  code += buildPythonImportBlock(stdImports, new Set(), pydanticImports, "pydantic");
  code += "\n\n";
  code += aliases.join("\n") + "\n";

  return (
    <SourceFile path={props.path ?? "_scalars.py"} filetype="py" printWidth={9999}>
      {code}
    </SourceFile>
  );
}

export function collectAliasableScalarsForModels(
  program: Program,
  models: readonly Model[],
): Scalar[] {
  const scalars = new Map<string, Scalar>();
  for (const model of models) {
    for (const scalar of collectAliasableCustomScalars(program, model)) {
      scalars.set(getTypeFullName(program, scalar), scalar);
    }
  }

  return [...scalars.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, scalar]) => scalar);
}

export function buildPythonScalarAliasNames(
  program: Program,
  scalars: readonly Scalar[],
): Map<Scalar, string> {
  const nameCounts = scalars.reduce((counts, scalar) => {
    counts.set(scalar.name, (counts.get(scalar.name) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  return scalars.reduce((aliases, scalar) => {
    const hasCollision = (nameCounts.get(scalar.name) ?? 0) > 1;
    aliases.set(scalar, hasCollision ? getQualifiedAliasName(program, scalar) : scalar.name);
    return aliases;
  }, new Map<Scalar, string>());
}

function getQualifiedAliasName(program: Program, scalar: Scalar): string {
  const namespace = getNamespaceSegments(scalar.namespace, program.getGlobalNamespaceType())
    .map(camelToPascal)
    .join("");
  return toPythonIdentifier(`${namespace}${camelToPascal(scalar.name)}`);
}

function toPythonIdentifier(value: string): string {
  const identifier = value.replaceAll(/\W/g, "_");
  return /^\d/.test(identifier) ? `_${identifier}` : identifier;
}
