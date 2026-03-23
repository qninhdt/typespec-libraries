import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod string constraints", () => {
  it("generates .min() for @minLength", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @minLength(2) name: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".min(");
  });

  it("generates .max() for @maxLength", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @maxLength(100) bio: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".max(");
  });

  it("generates .regex() for @pattern", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @pattern("^[A-Za-z]+$") code: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".regex(");
    expect(output).toContain("^[A-Za-z]+$");
  });

  it("generates .email() for @format email", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @format("email") email: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".email()");
  });

  it("generates .url() for @format url", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @format("url") website?: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".url()");
  });

  it("generates multiple string constraints combined", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @minLength(1) @maxLength(255) @format("email") email: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".min(");
    expect(output).toContain(".max(");
    expect(output).toContain(".email()");
  });
});

describe("Zod numeric constraints", () => {
  it("generates .min() (gte) for @minValue", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Product {
        @minValue(0) quantity: int32;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".nonnegative()");
  });

  it("generates .max() (lte) for @maxValue", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Product {
        @maxValue(100) quantity: int32;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".lte(");
  });

  it("generates .gt() for @minValueExclusive", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Product {
        @minValueExclusive(0) quantity: int32;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".gt(");
  });

  it("generates .lt() for @maxValueExclusive", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Product {
        @maxValueExclusive(100) quantity: int32;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".lt(");
  });

  it("generates .nonnegative() for @minValue(0)", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Product {
        @minValue(0) quantity: int32;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".nonnegative()");
  });

  it("generates multiple numeric constraints combined", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Product {
        @minValue(0) @maxValue(100) quantity: int32;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain(".nonnegative()");
    expect(output).toContain(".lte(");
  });
});

describe("Zod array constraints", () => {
  it("generates .min() for @minItems", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @minItems(1) tags: string[];
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".min(");
  });

  it("generates .max() for @maxItems", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @maxItems(10) tags: string[];
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".max(");
  });

  it("generates both .min() and .max() for @minItems/@maxItems", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @minItems(1) @maxItems(10) tags: string[];
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".min(");
    expect(output).toContain(".max(");
  });
});
