import { describe, expect, it } from "vitest";
import { ZodScalarDeclaration } from "../src/components/ZodScalarDeclaration.js";
import { ZodSchemaDeclaration } from "../src/components/ZodSchemaDeclaration.js";

describe("ZodScalarDeclaration", () => {
  it("re-exports ZodSchemaDeclaration", () => {
    expect(ZodScalarDeclaration).toBe(ZodSchemaDeclaration);
  });
});
