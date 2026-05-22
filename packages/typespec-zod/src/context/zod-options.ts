/**
 * Zod emit options.
 */

import { Program } from "@typespec/compiler";
import type { ZodEmitterOptions } from "../lib.js";

/**
 * Read the user-facing emitter options off a Program. Falls back to the
 * test-fixture stub shape (`getCompilerOptions().emitterOutput[...]`) when
 * the real `compilerOptions.options[...]` isn't present.
 */
export function getZodOptions(program: Program | undefined): ZodEmitterOptions {
  let raw: ZodEmitterOptions = {};
  if (program) {
    const stubProgram = program as Program & {
      compilerOptions?: { options?: Record<string, ZodEmitterOptions> };
      getCompilerOptions?: () => { emitterOutput?: Record<string, ZodEmitterOptions> };
    };
    const direct = stubProgram.compilerOptions?.options?.["@qninhdt/typespec-zod"];
    const stubbed =
      typeof stubProgram.getCompilerOptions === "function"
        ? stubProgram.getCompilerOptions()?.emitterOutput?.["@qninhdt/typespec-zod"]
        : undefined;
    raw = direct ?? stubbed ?? {};
  }
  return {
    ...raw,
    "int64-strategy": raw["int64-strategy"] ?? "string",
  };
}
