import { describe, expect, it } from "vitest";
import { createEmitterTestRunner } from "../utils.jsx";

describe("Zod emitter end-to-end", () => {
  it("emits a complete model without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @data("Registration Form")
      model RegisterForm {
        @title("Full Name") @minLength(1) name: string;
        @title("Email") @format("email") email: string;
        @title("Password") @minLength(8) password: string;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits model with enums without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      enum Status {
        active: "active",
        inactive: "inactive",
      }

      @data("Status form")
      model StatusForm {
        status: Status;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits model with all decorator features without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @data("User form")
      model UserForm {
        @minLength(1) @maxLength(255) name: string;
        @format("email") email: string;
        @minValue(0) @maxValue(200) age?: int32;
        @pattern("^[A-Za-z]+$") code?: string;
        /** The user bio */
        bio?: string;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits model with arrays and tuples without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @data("Tags form")
      model TagsForm {
        tags: string[];
        coordinates: [int32, int32];
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits model with unions without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @data("Result form")
      model ResultForm {
        value: string | null;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits model with optional and default fields without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @data("Config form")
      model ConfigForm {
        enabled: boolean = true;
        count?: int32;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });
});
