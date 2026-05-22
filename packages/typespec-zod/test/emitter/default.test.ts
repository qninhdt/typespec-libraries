import { describe, expect, it } from "vitest";
import { emitZodFile } from "../utils.jsx";

describe("Zod emitter end-to-end", () => {
  it("emits a complete form schema with validations, metadata, and inferred type", async () => {
    const output = await emitZodFile(
      `
      @data("Registration Form")
      model RegisterForm {
        @title("Full Name") @minLength(1) name: string;
        @title("Email") contact: email;
        @title("Password") @minLength(8) password: string;
      }
    `,
      "RegisterForm.ts",
    );

    expect(output).toContain("export const RegisterFormSchema = z.object(");
    expect(output).toContain("name: z.string().min(1)");
    expect(output).toContain("contact: z.email()");
    expect(output).toContain("password: z.string().min(8)");
    expect(output).toContain("export type RegisterForm = z.infer<typeof RegisterFormSchema>;");
    expect(output).toContain("export const RegisterFormMeta");
    expect(output).toContain('name: { title: "Full Name"');
    expect(output).toContain('contact: { title: "Email", inputType: "email"');
  });

  it("emits enum-typed fields inline", async () => {
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

    expect(output).toContain("export const StatusFormSchema = z.object(");
    expect(output).toContain('status: z.enum(["active", "inactive"])');
    expect(output).not.toContain("status: z.any()");
  });

  it("emits decorator features as Zod validation chains and descriptions", async () => {
    const output = await emitZodFile(
      `
      @data("User form")
      model UserForm {
        @minLength(1) @maxLength(255) name: string;
        contact: email;
        @minValue(0) @maxValue(200) age?: int32;
        @pattern("^[A-Za-z]+$") code?: string;
        /** The user bio */
        bio?: string;
      }
    `,
      "UserForm.ts",
    );

    expect(output).toContain("name: z.string().min(1).max(255)");
    expect(output).toContain("contact: z.email()");
    expect(output).toContain("age: z.number().int().nonnegative().lte(200).optional()");
    expect(output).toContain('code: z.string().regex(new RegExp("^[A-Za-z]+$")).optional()');
    expect(output).toContain('bio: z.string().optional().describe("The user bio")');
  });

  it("emits arrays and tuples with element schemas", async () => {
    const output = await emitZodFile(
      `
      @data("Tags form")
      model TagsForm {
        tags: string[];
        coordinates: [int32, int32];
      }
    `,
      "TagsForm.ts",
    );

    expect(output).toContain("tags: z.array(z.string())");
    expect(output).toContain("coordinates: z.tuple(");
    expect(output).toContain("z.number().int()");
  });

  it("emits union fields with each variant schema", async () => {
    const output = await emitZodFile(
      `
      @data("Result form")
      model ResultForm {
        value: string | null;
      }
    `,
      "ResultForm.ts",
    );

    expect(output).toContain("value: z.union(");
    expect(output).toContain("z.string()");
    expect(output).toContain("z.null()");
  });

  it("emits optional and default fields as Zod member modifiers", async () => {
    const output = await emitZodFile(
      `
      @data("Config form")
      model ConfigForm {
        enabled: boolean = true;
        count?: int32;
      }
    `,
      "ConfigForm.ts",
    );

    expect(output).toContain("enabled: z.boolean().default(true)");
    expect(output).toContain("count: z.number().int().optional()");
  });
});
