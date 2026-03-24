import { describe, expect, it } from "vitest";
import type { Program, Scalar, Type } from "@typespec/compiler";
import {
  ZodCustomEmitOptions,
  defaultZodOptions,
  getEmitOptionsForType,
  getEmitOptionsForTypeKind,
  getZodOptions,
} from "../src/context/zod-options.js";
import { createTestRunner } from "./utils.jsx";

type ProgramStubOverrides = Partial<Program> & {
  getCompilerOptions?: () => { emitterOutput?: Record<string, unknown> };
};

function createProgramStub(overrides?: ProgramStubOverrides): Program {
  return {
    getCompilerOptions: () => ({}),
    ...overrides,
  } as Program;
}

describe("ZodCustomEmitOptions", () => {
  it("returns options registered for an exact type", () => {
    const custom = ZodCustomEmitOptions();
    const type = { kind: "Model", name: "User" } as Type;
    const reference = { noDeclaration: true };

    custom.forType(type, reference);

    expect(getEmitOptionsForType(createProgramStub(), type, custom)).toBe(reference);
  });

  it("returns options registered for a type kind", () => {
    const custom = ZodCustomEmitOptions();
    const options = { noDeclaration: true };

    custom.forTypeKind("Enum", options);

    expect(getEmitOptionsForTypeKind(createProgramStub(), "Enum", custom)).toBe(options);
  });

  it("falls back to a custom base scalar option", () => {
    const custom = ZodCustomEmitOptions();
    const options = { noDeclaration: true };

    return createTestRunner().then(async (runner) => {
      const compiled = (await runner.compile(`
        scalar CustomBase extends string;
        scalar CustomDerived extends CustomBase;
      `)) as Record<string, Scalar>;

      custom.forType(compiled.CustomBase, options);
      expect(getEmitOptionsForType(runner.program, compiled.CustomDerived, custom)).toBe(options);
    });
  });
});

describe("getZodOptions", () => {
  it("returns default options when program is missing", () => {
    expect(getZodOptions(undefined)).toEqual({});
  });

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
    });
  });

  it("exposes the documented defaults", () => {
    expect(defaultZodOptions).toEqual({
      "output-dir": undefined,
      standalone: false,
      "library-name": undefined,
      include: undefined,
      exclude: undefined,
    });
  });
});
