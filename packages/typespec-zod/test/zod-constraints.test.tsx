import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod string constraints", () => {
  it("generates .min() for minLength", async () => {
    const output = await emitZodFile(
      `
      @data("User")
      model User {
        @minLength(3) name: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".min(3)");
  });

  it("generates .max() for maxLength", async () => {
    const output = await emitZodFile(
      `
      @data("User")
      model User {
        @maxLength(100) name: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".max(100)");
  });

  it("generates .regex() for pattern", async () => {
    const output = await emitZodFile(
      `
      @data("User")
      model User {
        @pattern("^[a-z]+$") slug: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".regex(");
    expect(output).toContain("^[a-z]+$");
  });

  it("generates .email() for email semantic scalar", async () => {
    const output = await emitZodFile(
      `
      @data("User")
      model User {
        contact: email;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".email()");
  });

  it("generates .url() for url semantic scalar", async () => {
    const output = await emitZodFile(
      `
      @data("User")
      model User {
        website?: url;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".url()");
  });
});

describe("Zod numeric constraints", () => {
  it("generates .gte() for inclusive min", async () => {
    const output = await emitZodFile(
      `
      @data("Product")
      model Product {
        @minValue(1) rating: int32;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".gte(1)");
  });

  it("generates .lte() for inclusive max", async () => {
    const output = await emitZodFile(
      `
      @data("Product")
      model Product {
        @maxValue(100) rating: int32;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".lte(100)");
  });

  it("generates .gt() for exclusive min", async () => {
    const output = await emitZodFile(
      `
      @data("Product")
      model Product {
        @minValueExclusive(0) price: float64;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".gt(0)");
  });

  it("generates .lt() for exclusive max", async () => {
    const output = await emitZodFile(
      `
      @data("Product")
      model Product {
        @maxValueExclusive(1000) price: float64;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".lt(1000)");
  });

  it("combines min and max constraints", async () => {
    const output = await emitZodFile(
      `
      @data("Product")
      model Product {
        @minValue(1) @maxValue(5) rating: int32;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".gte(1)");
    expect(output).toContain(".lte(5)");
  });
});

describe("Zod array constraints", () => {
  it("generates .min() for minItems on arrays", async () => {
    const output = await emitZodFile(
      `
      @data("Config")
      model Config {
        @minItems(1) tags: string[];
      }
    `,
      "Config.ts",
    );

    expect(output).toContain(".min(1)");
  });

  it("generates .max() for maxItems on arrays", async () => {
    const output = await emitZodFile(
      `
      @data("Config")
      model Config {
        @maxItems(10) tags: string[];
      }
    `,
      "Config.ts",
    );

    expect(output).toContain(".max(10)");
  });

  it("preserves zero maxItems constraints", async () => {
    const output = await emitZodFile(
      `
      @data("Config")
      model Config {
        @maxItems(0) tags: string[];
      }
    `,
      "Config.ts",
    );

    expect(output).toContain(".max(0)");
  });
});

describe("Zod optional and nullable", () => {
  it("generates .optional() for optional fields", async () => {
    const output = await emitZodFile(
      `
      @data("User")
      model User {
        bio?: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".optional()");
  });
});
