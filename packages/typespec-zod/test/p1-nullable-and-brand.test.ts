import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("P1 Group C — nullable vs optional handling", () => {
  it("emits .optional().nullable() for `field?: string | null`", async () => {
    const output = await emitZodFile(
      `
      model F {
        field?: string | null;
      }
    `,
      "F.ts",
    );
    const start = output.indexOf("field");
    const fieldLine = output.slice(start, start + 200);
    expect(fieldLine).toMatch(/\.optional\(\)/);
    expect(fieldLine).toMatch(/\.nullable\(\)/);
  });

  it("emits .nullable() but NOT .optional() for `field: string | null`", async () => {
    const output = await emitZodFile(
      `
      model F {
        field: string | null;
      }
    `,
      "F.ts",
    );
    const start = output.indexOf("field");
    const fieldLine = output.slice(start, start + 200);
    expect(fieldLine).toMatch(/\.nullable\(\)/);
    expect(fieldLine).not.toMatch(/\.optional\(\)/);
  });

  it("emits no .nullable() for plain non-null field", async () => {
    const output = await emitZodFile(
      `
      model F {
        field: string;
      }
    `,
      "F.ts",
    );
    const start = output.indexOf("field");
    const fieldLine = output.slice(start, start + 100);
    expect(fieldLine).not.toMatch(/\.nullable\(\)/);
  });
});

describe("P1 Group D — branded-scalars opt-in", () => {
  it("OFF (default): user-defined scalar declaration omits .brand()", async () => {
    const output = await emitZodFile(
      `
      @minLength(4)
      scalar Code extends string;

      model F { code: Code; }
    `,
      "_scalars.ts",
    );
    expect(output).toContain("export const CodeSchema");
    expect(output).not.toContain('.brand("Code")');
  });

  it("ON: scalar declaration appends .brand(scalarName)", async () => {
    const output = await emitZodFile(
      `
      @minLength(4)
      scalar Code extends string;

      model F { code: Code; }
    `,
      "_scalars.ts",
      false,
      { "branded-scalars": true },
    );
    expect(output).toContain("export const CodeSchema");
    expect(output).toContain('.brand("Code")');
  });
});
