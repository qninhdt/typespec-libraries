import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod descriptions", () => {
  it("emits describe() from model property docs", async () => {
    const output = await emitZodFile(
      `
      model InviteForm {
        @doc("Email of the invitee")
        inviteeEmail: string;
      }
    `,
      "InviteForm.ts",
    );

    expect(output).toContain('.describe("Email of the invitee")');
  });

  it("escapes quotes and collapses newlines in docs", async () => {
    const output = await emitZodFile(
      `
      model InviteForm {
        @doc("""
          A "quoted"
          line
        """)
        inviteeEmail: string;
      }
    `,
      "InviteForm.ts",
    );

    expect(output).toContain('.describe("  A \\"quoted\\"   line")');
  });

  it("does not leak intrinsic doc from built-in scalars onto fields", async () => {
    const output = await emitZodFile(
      `
      model Account {
        id: uuid;
        createdAt: utcDateTime;
        balance: int64;
      }
    `,
      "Account.ts",
    );

    // No describe() should appear when only intrinsic scalar docs exist on
    // a built-in scalar type with no field-level @doc.
    expect(output).not.toContain(".describe(");
  });

  it("terminates a .describe(...) chain with a semicolon", async () => {
    const output = await emitZodFile(
      `
      @doc("Public user record")
      model PublicUser {
        name: string;
      }
    `,
      "PublicUser.ts",
    );

    // The exported declaration must end the .describe(...) chain with `;`
    // so downstream tools (tsc, prettier) accept the rendered file.
    expect(output).toMatch(/\.describe\("Public user record"\);/);
  });

  it("terminates a .brand(...) chain with a semicolon", async () => {
    const output = await emitZodFile(
      `
      @minLength(8)
      @maxLength(128)
      scalar StrongPassword extends string;

      model SignInRequest {
        password: StrongPassword;
      }
    `,
      "_scalars.ts",
      false,
      { "branded-scalars": true },
    );

    // Custom scalar declarations end with .brand("Name") and must terminate
    // with `;` to keep the rendered _scalars.ts file syntactically valid.
    expect(output).toMatch(/\.brand\("StrongPassword"\);/);
  });
});
