import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod scalar type mappings", () => {
  it("maps string to z.string()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        name: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.string()");
  });

  it("maps boolean to z.boolean()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        active: boolean;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.boolean()");
  });

  it("maps integer types to z.number().int()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model IntTest {
        a: int8;
        b: int16;
        c: int32;
        d: int64;
      }
    `,
      "IntTest.ts",
    );

    expect(output).toContain("z.number()");
    expect(output).toContain(".int()");
  });

  it("maps float types to z.number()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model FloatTest {
        a: float32;
        b: float64;
      }
    `,
      "FloatTest.ts",
    );

    expect(output).toContain("z.number()");
  });

  it("maps decimal to z.number()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Product {
        price: decimal;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain("z.number()");
  });

  it("maps bytes to z.instanceof() with Uint8Array", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        data: bytes;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.instanceof()");
  });

  it("maps plainDate to z.coerce.date()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        birthDate: plainDate;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.coerce.date()");
  });

  it("maps plainTime to z.string().time()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        time: plainTime;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.string()");
    expect(output).toContain(".time()");
  });

  it("maps utcDateTime to z.coerce.date()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        createdAt: utcDateTime;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.coerce.date()");
  });

  it("maps duration to z.string().duration()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Task {
        duration: duration;
      }
    `,
      "Task.ts",
    );

    expect(output).toContain("z.string()");
    expect(output).toContain(".duration()");
  });

  it("maps safeint to z.number().int().safe()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        age: safeint;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.number()");
    expect(output).toContain(".int()");
    expect(output).toContain(".safe()");
  });
});

describe("Zod optional fields", () => {
  it("generates .optional() for optional fields", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        name: string;
        bio?: string;
      }
    `,
      "User.ts",
    );

    // bio field should have .optional()
    const bioIndex = output.indexOf("bio:");
    expect(bioIndex).toBeGreaterThan(-1);
    const bioSection = output.slice(bioIndex, bioIndex + 50);
    expect(bioSection).toContain(".optional()");
  });

  it("generates .default() for fields with default values", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        enabled: boolean = true;
        count: int32 = 0;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".default(");
  });

  it("matches numeric default literals to the emitted schema type", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        count: int32 = 0;
        total: int64 = 42;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".default(0)");
    expect(output).toContain(".default(42n)");
    expect(output).not.toContain(".default(0n)");
  });
});
