import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod standalone mode", () => {
  it("generates model file in models/ folder with correct path", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        name: string;
        email: string;
      }
    `,
      "models/User.ts",
      true, // modelsFolder = true
    );

    // Should have z.object with fields
    expect(output).toContain("z.object(");
    expect(output).toContain("name:");
    expect(output).toContain("email:");
  });

  it("generates z.object with all field types", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        name: string;
        age: int32;
        active: boolean;
      }
    `,
      "models/User.ts",
      true,
    );

    expect(output).toContain("name:");
    expect(output).toContain("z.string()");
    expect(output).toContain("age:");
    expect(output).toContain("z.number()");
    expect(output).toContain("active:");
    expect(output).toContain("z.boolean()");
  });

  it("generates optional fields correctly", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        name: string;
        bio?: string;
      }
    `,
      "models/User.ts",
      true,
    );

    const bioIndex = output.indexOf("bio:");
    expect(bioIndex).toBeGreaterThan(-1);
    const bioSection = output.slice(bioIndex, bioIndex + 50);
    expect(bioSection).toContain(".optional()");
  });
});
