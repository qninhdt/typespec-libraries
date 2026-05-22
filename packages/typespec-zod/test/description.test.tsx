import { describe, expect, it } from "vitest";
import { emitZodFile } from "./utils.jsx";

describe("Zod descriptions", () => {
  it("emits describe() from model property docs", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
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
      @data("Form")
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
      @data("Form")
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
});
