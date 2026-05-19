import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod enum generation", () => {
  it("emits enum fields as references to the generated enum schema", async () => {
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
    expect(output).toContain("status: StatusSchema");
    expect(output).not.toContain("status: z.any()");
  });

  it("emits optional enum fields with optional schema references", async () => {
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
    expect(output).toContain("status: StatusSchema.optional()");
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
