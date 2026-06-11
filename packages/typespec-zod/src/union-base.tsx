/**
 * Union base schema resolution. Handles both anonymous unions
 * (z.union([...])) and discriminated unions (z.discriminatedUnion(...)).
 */

import { Children, For } from "@alloy-js/core";
import { ArrayExpression } from "@alloy-js/typescript";
import { Model, Type, Union, UnionVariant } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { useTsp } from "@typespec/emitter-framework";
import { ZodSchema } from "./components/ZodSchema.js";
import { callPart, zodMemberExpr } from "./utils.js";

export function unionBaseType(type: Union): Children {
  const { $ } = useTsp();

  const discriminated = $.union.getDiscriminatedUnion(type);

  if ($.union.isExpression(type) || !discriminated) {
    return zodMemberExpr(
      callPart(
        "union",
        <ArrayExpression>
          <For each={type.variants} comma line>
            {(_name: string | symbol, variant: UnionVariant) => {
              return <ZodSchema type={variant.type} nested />;
            }}
          </For>
        </ArrayExpression>,
      ),
    );
  }

  const propKey = discriminated.options.discriminatorPropertyName;
  const envKey = discriminated.options.envelopePropertyName;
  const unionArgs = [
    JSON.stringify(propKey),
    <ArrayExpression>
      <For each={Array.from(type.variants.values())} comma line>
        {(variant: UnionVariant) => {
          if (discriminated.options.envelope === "object") {
            return (
              <ZodSchema type={createEnvelopeModel($, type, propKey, envKey, variant)} nested />
            );
          }
          return <ZodSchema type={variant.type} nested />;
        }}
      </For>
    </ArrayExpression>,
  ];

  return zodMemberExpr(callPart("discriminatedUnion", ...unionArgs));
}

/**
 * Build the synthetic envelope model that backs an `envelope: "object"`
 * discriminated union. We deliberately keep the model anonymous (no `name`)
 * so it falls into the inline-emission path of `ZodSchema` — giving it a
 * name would flip `shouldReference` and require a separate declaration.
 *
 * What we DO change: stamp the parent union's namespace on the synthetic
 * model. This way any future collision-detection that keys models by
 * `kind:namespace.name` won't lump every emitter-generated envelope into
 * the global namespace; two unions with the same variant names in two
 * different namespaces get unambiguous identities.
 */
function createEnvelopeModel(
  $: Typekit,
  parent: Union,
  propKey: string,
  envKey: string,
  variant: { name: string | symbol; type: Type },
): Model {
  const variantName = typeof variant.name === "string" ? variant.name : "";
  const created = $.model.create({
    properties: {
      [propKey]: $.modelProperty.create({
        name: propKey,
        type: $.literal.create(variantName),
      }),
      [envKey]: $.modelProperty.create({
        name: envKey,
        type: variant.type,
      }),
    },
  });
  if (parent.namespace) {
    (created as { namespace?: typeof parent.namespace }).namespace = parent.namespace;
  }
  return created;
}
