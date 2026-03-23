import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod object schema generation", () => {
  it("generates z.object({...}) for model", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        name: string;
        email: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.object(");
    expect(output).toContain("name:");
    expect(output).toContain("email:");
  });

  it("generates field name as key in object", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        firstName: string;
        lastName: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("firstName:");
    expect(output).toContain("lastName:");
  });

  it("generates nested object schemas", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Address {
        street: string;
        city: string;
      }

      @data("Form")
      model User {
        name: string;
        address: Address;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.object(");
    expect(output).toContain("address:");
  });

  it("generates optional fields with .optional()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        name: string;
        bio?: string;
        age?: int32;
      }
    `,
      "User.ts",
    );

    const bioIndex = output.indexOf("bio:");
    expect(bioIndex).toBeGreaterThan(-1);
    const bioSection = output.slice(bioIndex, bioIndex + 50);
    expect(bioSection).toContain(".optional()");
  });

  it("generates default values with .default()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        enabled: boolean = true;
        count: int32 = 0;
        name: string = "Anonymous";
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".default(");
  });
});

describe("Zod array schema generation", () => {
  it("generates z.array() for array types", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        tags: string[];
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.array(");
  });

  it("generates array with element schema", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        emails: string[];
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.array(");
    expect(output).toContain("z.string()");
  });

  it("generates array with constraints", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        @minItems(1) @maxItems(10) tags: string[];
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.array(");
    expect(output).toContain(".min(");
    expect(output).toContain(".max(");
  });
});

describe("Zod tuple schema generation", () => {
  it("generates z.tuple([...]) for tuple types", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        coordinates: [int32, int32];
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.tuple(");
  });

  it("generates tuple with element schemas", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Config {
        values: [string, int32, boolean];
      }
    `,
      "Config.ts",
    );

    expect(output).toContain("z.tuple(");
  });
});

describe("Zod union schema generation", () => {
  it("generates z.union([...]) for unions", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Result {
        value: string | null;
      }
    `,
      "Result.ts",
    );

    expect(output).toContain("z.union(");
  });

  it("generates z.null() for null type", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Result {
        value: string | null;
      }
    `,
      "Result.ts",
    );

    expect(output).toContain("z.null()");
  });

  it("generates z.never() for empty union", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Config {
        value: never;
      }
    `,
      "Config.ts",
    );

    expect(output).toContain("z.never()");
  });

  it("generates z.unknown() for unknown type", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Config {
        data: unknown;
      }
    `,
      "Config.ts",
    );

    expect(output).toContain("z.unknown()");
  });
});
