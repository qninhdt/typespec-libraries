import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("Ent @data model generation", () => {
  it("treats unmarked models as plain form structs", async () => {
    const output = await emitGoFile(
      `
      model CreateUserForm {
        name: string;
      }
    `,
      "create_user_form.go",
    );

    expect(output).toContain("type CreateUserForm struct {");
    expect(output).toContain('json:"name"');
    expect(output).not.toContain("TableName()");
  });

  it("generates struct WITHOUT ent tags and WITHOUT TableName()", async () => {
    const output = await emitGoFile(
      `
      @data("User creation form")
      model CreateUserForm {
        name: string;
        email: string;
      }
    `,
      "create_user_form.go",
    );

    // Should have struct
    expect(output).toContain("type CreateUserForm struct {");
    // Should NOT have ent tags
    expect(output).not.toContain('ent:"');
    // Should NOT have TableName method
    expect(output).not.toContain("TableName()");
    // Should have json tags
    expect(output).toContain('json:"name"');
    expect(output).toContain('json:"email"');
  });

  it("generates validate tags for constraints", async () => {
    const output = await emitGoFile(
      `
      @data("Form")
      model TestForm {
        @maxLength(100) name: string;
        email: email;
        bio?: string;
      }
    `,
      "test_form.go",
    );

    // Required + max length
    expect(output).toContain("required,max=100");
    // Email format
    expect(output).toContain("email");
    // Optional → omitempty
    const bioLine = output.split("\n").find((l) => l.includes("Bio "));
    expect(bioLine).toContain("omitempty");
  });

  it("generates inherited data model fields", async () => {
    const output = await emitGoFile(
      `
      model BaseForm {
        @title("Email Address") email: email;
      }

      model InviteForm {
        ...BaseForm;
        message?: string;
      }
    `,
      "invite_form.go",
    );

    expect(output).toContain("BaseForm");
    expect(output).not.toContain("Email string");
    expect(output).toContain("Message *string");
  });

  it("generates table mixins as Ent mixins", async () => {
    const mixin = await emitGoFile(
      `
      @tableMixin
      model Timestamped {
        createdAt: utcDateTime;
      }

      @table
      model User {
        ...Timestamped;
        @key id: uuid;
      }
    `,
      "timestamped.go",
    );
    const table = await emitGoFile(
      `
      @tableMixin
      model Timestamped {
        createdAt: utcDateTime;
      }

      @table
      model User {
        ...Timestamped;
        @key id: uuid;
      }
    `,
      "user.go",
    );

    expect(mixin).toContain("mixin.Schema");
    expect(mixin).toContain("func (Timestamped) Fields() []ent.Field");
    expect(table).toContain("func (User) Mixin() []ent.Mixin");
    expect(table).toContain("Timestamped{}");
  });

  it("generates form tags with @title and @placeholder", async () => {
    const output = await emitGoFile(
      `
      @data("Invite form")
      model InviteForm {
        @title("Email Address") @placeholder("user@example.com") email: string;
        @title("Message") message?: string;
      }
    `,
      "invite_form.go",
    );

    // Form tag with title and placeholder
    expect(output).toContain("title=Email Address");
    expect(output).toContain("placeholder=user@example.com");
    // Form tag with title only
    expect(output).toContain("title=Message");
  });

  it("generates doc comment on @data struct", async () => {
    const output = await emitGoFile(
      `
      @data("User creation form")
      model CreateUserForm {
        name: string;
      }
    `,
      "create_user_form.go",
    );

    expect(output).toContain("// CreateUserForm User creation form");
  });

  it("does not generate import block when no special types used", async () => {
    const output = await emitGoFile(
      `
      @data("Simple form")
      model SimpleForm {
        name: string;
        age: int32;
      }
    `,
      "simple_form.go",
    );

    // No imports needed for basic types in @data
    expect(output).not.toContain("import (");
  });
});
