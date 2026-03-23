import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod enum generation", () => {
  it("emits model with enum field without errors", async () => {
    // Just verify no compilation errors - enum references across files need the real emitter
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

    // The output should exist and have the model schema
    expect(output).toContain("StatusFormSchema");
    expect(output).toContain("z.object(");
  });

  it("emits optional enum field without errors", async () => {
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
