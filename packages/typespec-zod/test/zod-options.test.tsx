import { describe, expect, it } from "vitest";
import type { Program } from "@typespec/compiler";
import { getZodOptions } from "../src/context/zod-options.js";

type ProgramStubOverrides = Partial<Program> & {
  getCompilerOptions?: () => { emitterOutput?: Record<string, unknown> };
};

function createProgramStub(overrides?: ProgramStubOverrides): Program {
  return {
    getCompilerOptions: () => ({}),
    ...overrides,
  } as Program;
}

describe("getZodOptions", () => {
  it("reads emitter options from compiler output", () => {
    const program = createProgramStub({
      getCompilerOptions: () => ({
        emitterOutput: {
          "@qninhdt/typespec-zod": {
            standalone: true,
            "library-name": "demo-lib",
          },
        },
      }),
    });

    expect(getZodOptions(program)).toEqual({
      standalone: true,
      "library-name": "demo-lib",
      "int64-strategy": "string",
    });
  });

  it("defaults int64-strategy to string when no options provided", () => {
    expect(getZodOptions(createProgramStub())).toEqual({
      "int64-strategy": "string",
    });
  });
});
