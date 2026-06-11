/**
 * Zod emit options.
 */

import { Program } from "@typespec/compiler";
import type { ZodEmitterOptions } from "../lib.js";

/**
 * Read the user-facing emitter options off a Program.
 *
 * Contract: production reads `program.compilerOptions.options[<emitter-name>]`
 * (set by the TypeSpec compiler when invoking emitters). Tests stash options
 * the same way via `renderZodOutput` in `test/utils.tsx`. Both paths funnel
 * through `compilerOptions.options[...]`; the legacy `getCompilerOptions().emitterOutput[...]`
 * fallback is kept only as a defense-in-depth for older test fixtures and
 * may be removed once those fixtures migrate.
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
