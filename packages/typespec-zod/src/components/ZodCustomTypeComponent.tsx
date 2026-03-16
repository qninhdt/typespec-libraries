/**
 * ZodCustomTypeComponent - allows custom handling of specific types.
 */

import { Children, ComponentDefinition } from "@alloy-js/core";
import type { ModelProperty, Type } from "@typespec/compiler";

export interface ZodCustomTypeComponentCommonProps<T extends Type> {
  /**
   * The TypeSpec type to render.
   */
  type: T;

  /**
   * The default rendering.
   */
  children: Children;
}

export interface ZodCustomTypeComponentDeclarationProps<
  T extends Type,
  U extends ComponentDefinition<any>,
> extends ZodCustomTypeComponentCommonProps<T> {
  /**
   * Pass when rendering a declaration for the provided type or type kind.
   */
  declare: true;

  /**
   * The props passed to VarDeclaration to declare this type.
   */
  declarationProps: U extends ComponentDefinition<infer P> ? P : never;

  /**
   * The component to use to declare this type.
   */
  Declaration: U;
}

export interface ZodCustomTypeComponentReferenceProps<
  T extends Type,
> extends ZodCustomTypeComponentCommonProps<T> {
  /**
   * Pass when rendering a reference to the provided type or type kind.
   */
  reference: true;

  /**
   * The member this type is referenced from, if any. This member may contain
   * additional metadata that should be represented in the emitted output.
   */
  member?: ModelProperty;
}

export type ZodCustomTypeComponentProps<T extends Type, U extends ComponentDefinition<any>> =
  | ZodCustomTypeComponentDeclarationProps<T, U>
  | ZodCustomTypeComponentReferenceProps<T>;

// For now, we don't have custom emit options, so we just render children
export function ZodCustomTypeComponent<T extends Type, U extends ComponentDefinition<any>>(
  props: ZodCustomTypeComponentProps<T, U>,
): Children {
  // For now, just render the default (children)
  // Custom type handling can be added later with ZodOptions
  return <>{props.children}</>;
}
