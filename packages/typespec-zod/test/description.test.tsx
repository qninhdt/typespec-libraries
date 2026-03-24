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
});
