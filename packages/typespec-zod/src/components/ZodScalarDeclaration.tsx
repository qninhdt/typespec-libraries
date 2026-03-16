/**
 * ZodScalarDeclaration - renders a Zod schema declaration for a scalar.
 */

import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { Children } from "@alloy-js/core";
import { refkeySym } from "../utils.js";
import { ZodCustomTypeComponent } from "./ZodCustomTypeComponent.js";
import { ZodSchema, ZodSchemaProps } from "./ZodSchema.js";

interface ZodScalarDeclarationProps
  extends Omit<ts.VarDeclarationProps, "type" | "name" | "value" | "kind">, ZodSchemaProps {
  readonly name?: string;
}

/**
 * Declare a Zod schema for a scalar.
 */
export function ZodScalarDeclaration(props: ZodScalarDeclarationProps): Children {
  const internalRk = ay.refkey(props.type, refkeySym);
  const [zodSchemaProps, varDeclProps] = ay.splitProps(props, ["type", "nested"]) as [
    ZodScalarDeclarationProps,
    ts.VarDeclarationProps,
  ];

  const refkeys = [props.refkey ?? []].flat();
  refkeys.push(internalRk);
  const newProps = ay.mergeProps(varDeclProps, {
    refkey: refkeys,
    name: props.name,
  });

  return (
    <ZodCustomTypeComponent
      declare
      type={props.type}
      Declaration={ts.VarDeclaration}
      declarationProps={newProps}
    >
      <ts.VarDeclaration {...newProps}>
        <ZodSchema {...zodSchemaProps} />
      </ts.VarDeclaration>
    </ZodCustomTypeComponent>
  );
}
