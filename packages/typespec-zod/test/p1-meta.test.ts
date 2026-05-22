import { describe, expect, it } from "vitest";
import { emitZodFile, renderZodOutput } from "./utils.jsx";
import { getOutputFileContent } from "@qninhdt/typespec-orm/testing";

describe("P1 Group E — expanded *Meta shape", () => {
  it("emits min/max/description/regex when corresponding decorators are present", async () => {
    const output = await emitZodFile(
      `
      model F {
        @doc("Age in years")
        @minValue(0)
        @maxValue(100)
        age: int32;

        @pattern("^\\\\d+$")
        code: string;
      }
    `,
      "F.ts",
    );

    expect(output).toContain("export const FMeta");
    const metaStart = output.indexOf("FMeta");
    const metaSection = output.slice(metaStart);
    // Look for the per-field block
    expect(metaSection).toMatch(/age:\s*\{/);
    expect(metaSection).toContain("min: 0");
    expect(metaSection).toContain("max: 100");
    expect(metaSection).toContain('description: "Age in years"');
    expect(metaSection).toContain('regex: "^\\\\d+$"');
    expect(metaSection).toContain("required: true");
  });

  it('emits secret: true and multiline: true from @secret and @format("textarea")', async () => {
    const output = await emitZodFile(
      `
      model F {
        @secret
        token: string;

        @format("textarea")
        bio: string;
      }
    `,
      "F.ts",
    );

    const metaStart = output.indexOf("FMeta");
    const meta = output.slice(metaStart);
    expect(meta).toMatch(/token:\s*\{[^}]*secret: true/);
    expect(meta).toMatch(/bio:\s*\{[^}]*multiline: true/);
    expect(meta).toMatch(/bio:\s*\{[^}]*format: "textarea"/);
  });

  it("marks optional fields as required: false", async () => {
    const output = await emitZodFile(
      `
      model F {
        @title("Bio")
        bio?: string;
      }
    `,
      "F.ts",
    );
    const metaStart = output.indexOf("FMeta");
    const meta = output.slice(metaStart);
    expect(meta).toContain("required: false");
  });

  it("omits keys whose decorators are absent", async () => {
    const output = await emitZodFile(
      `
      model F {
        @title("Name") name: string;
      }
    `,
      "F.ts",
    );
    const metaStart = output.indexOf("FMeta");
    const meta = output.slice(metaStart);
    // No min/max/regex/format/secret/multiline entries on a plain field.
    expect(meta).not.toMatch(/name:\s*\{[^}]*min:/);
    expect(meta).not.toMatch(/name:\s*\{[^}]*max:/);
    expect(meta).not.toMatch(/name:\s*\{[^}]*regex:/);
    expect(meta).not.toMatch(/name:\s*\{[^}]*format:/);
    expect(meta).not.toMatch(/name:\s*\{[^}]*secret:/);
    expect(meta).not.toMatch(/name:\s*\{[^}]*multiline:/);
  });
});

describe("P1 Group F — typed FormFieldMeta contract", () => {
  it("emits the FormFieldMeta interface exactly once in _meta.ts", async () => {
    const output = await renderZodOutput(`
      model A {
        @title("X")
        x: string;
      }

      model B {
        @title("Y")
        y: string;
      }
    `);

    const metaFile = getOutputFileContent(output, "_meta.ts");
    const matches = metaFile.match(/interface FormFieldMeta\b/g) ?? [];
    expect(matches.length).toBe(1);
    expect(metaFile).toContain("export interface FormFieldMeta");
  });

  it("types the per-model Meta object as Record<string, FormFieldMeta>", async () => {
    const output = await emitZodFile(
      `
      model A {
        @title("X")
        x: string;
      }
    `,
      "A.ts",
    );
    expect(output).toContain("export const AMeta: Record<string, FormFieldMeta>");
  });
});
