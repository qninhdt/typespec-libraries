import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod enum generation", () => {
  it("emits string enum fields inline", async () => {
    const output = await emitZodFile(
      `
      enum Status {
        active: "active",
        inactive: "inactive",
      }

      @data("Status form")
      model StatusForm {
        status: Status;
      }
    `,
      "StatusForm.ts",
    );

    expect(output).toContain("StatusFormSchema");
    expect(output).toContain("z.object(");
    expect(output).toContain('status: z.enum(["active", "inactive"])');
    expect(output).not.toContain("status: z.any()");
  });

  it("emits optional enum fields with optional inline schemas", async () => {
    const output = await emitZodFile(
      `
      enum Status {
        active: "active",
        inactive: "inactive",
      }

      @data("Form")
      model StatusForm {
        status?: Status;
      }
    `,
      "StatusForm.ts",
    );

    expect(output).toContain("StatusFormSchema");
    expect(output).toContain("z.object(");
    expect(output).toContain('status: z.enum(["active", "inactive"]).optional()');
  });

  it("emits numeric enum fields as literal unions", async () => {
    const output = await emitZodFile(
      `
      enum Status {
        unspecified: 0,
        active: 1,
        inactive: 2,
      }

      @data("Status form")
      model StatusForm {
        status: Status;
      }
    `,
      "StatusForm.ts",
    );

    expect(output).toContain("status: z.union([z.literal(0), z.literal(1), z.literal(2)])");
  });
});

describe("Zod literal generation", () => {
  it("generates z.literal() for string literals", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Config {
        mode: "read" | "write";
      }
    `,
      "Config.ts",
    );

    expect(output).toContain("z.literal(");
  });

  it("generates z.literal() for number literals", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Config {
        value: 1 | 2 | 3;
      }
    `,
      "Config.ts",
    );

    expect(output).toContain("z.literal(");
  });

  it("generates z.literal() for boolean literals", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Config {
        flag: true | false;
      }
    `,
      "Config.ts",
    );

    expect(output).toContain("z.literal(");
  });
});
