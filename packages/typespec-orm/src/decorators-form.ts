import type { DecoratorContext, ModelProperty, Scalar } from "@typespec/compiler";
import { TitleKey, PlaceholderKey, InputTypeKey } from "./lib.js";

/** Human-readable title for a form field (maps to Pydantic Field(title=...) / Go form tag). */
export function $title(context: DecoratorContext, target: ModelProperty, text: string): void {
  context.program.stateMap(TitleKey).set(target, text);
}

/** Placeholder text shown inside an input before the user types. */
export function $placeholder(context: DecoratorContext, target: ModelProperty, text: string): void {
  context.program.stateMap(PlaceholderKey).set(target, text);
}

/**
 * HTML input type override for string-based scalars (e.g. "email", "url", "tel").
 * Intentionally targets Scalar (not ModelProperty) - see the derived.tsp example
 * for the @@inputType(Model.field::type, ...) augment pattern needed when the
 * property uses a lookup type.
 */
export function $inputType(context: DecoratorContext, target: Scalar, htmlType: string): void {
  context.program.stateMap(InputTypeKey).set(target, htmlType);
}
