import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel @data model (Pydantic BaseModel)", () => {
  it("treats unmarked models as BaseModel forms", async () => {
    const output = await emitPyFile(
      `
      model CreateUserForm {
        name: string;
      }
    `,
      "create_user_form.py",
    );

    expect(output).toContain("class CreateUserForm(BaseModel):");
    expect(output).not.toContain("table=True");
  });

  it("generates BaseModel WITHOUT table=True or __tablename__", async () => {
    const output = await emitPyFile(
      `
      @data("User creation form")
      model CreateUserForm {
        name: string;
        email: string;
      }
    `,
      "create_user_form.py",
    );

    expect(output).toContain("class CreateUserForm(BaseModel):");
    expect(output).not.toContain("table=True");
    expect(output).not.toContain("__tablename__");
    expect(output).toContain("from pydantic import BaseModel");
  });

  it("generates Field(...) with validation kwargs for required fields", async () => {
    const output = await emitPyFile(
      `
      @data("Form")
      model TestForm {
        @maxLength(100) name: string;
      }
    `,
      "test_form.py",
    );

    expect(output).toContain("Field(");
    expect(output).toContain("max_length=100");
  });

  it("generates inherited data model fields", async () => {
    const output = await emitPyFile(
      `
      model BaseForm {
        @title("Email Address") contact: email;
      }

      model InviteForm {
        ...BaseForm;
        message?: string;
      }
    `,
      "invite_form.py",
    );

    expect(output).toContain("from .base_form import BaseForm");
    expect(output).toContain("class InviteForm(BaseForm):");
    expect(output).not.toContain("contact: EmailStr = Field(...");
    expect(output).toContain("message: str | None = Field(None");
  });

  it("generates table mixins as SQLModel bases", async () => {
    const mixin = await emitPyFile(
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
      "timestamped.py",
    );
    const table = await emitPyFile(
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
      "user.py",
    );

    expect(mixin).toContain("class Timestamped(SQLModel):");
    expect(table).toContain("from .timestamped import Timestamped");
    expect(table).toContain("class User(Timestamped, table=True):");
  });

  it("generates T | None with Field(None) for optional fields", async () => {
    const output = await emitPyFile(
      `
      @data("Form")
      model TestForm {
        message?: string;
      }
    `,
      "test_form.py",
    );

    expect(output).toContain("str | None");
    expect(output).toContain("Field(None");
    expect(output).not.toContain("Optional");
  });

  it("generates title and placeholder in Field kwargs", async () => {
    const output = await emitPyFile(
      `
      @data("Invite form")
      model InviteForm {
        @title("Email Address") @placeholder("user@example.com") email: string;
      }
    `,
      "invite_form.py",
    );

    expect(output).toContain('title="Email Address"');
    expect(output).toContain('json_schema_extra={"placeholder": "user@example.com"}');
  });

  it("generates description from @doc", async () => {
    const output = await emitPyFile(
      `
      @data("Form")
      model TestForm {
        /** The user display name */
        name: string;
      }
    `,
      "test_form.py",
    );

    expect(output).toContain('description="The user display name"');
  });

  it("generates docstring from @data label", async () => {
    const output = await emitPyFile(
      `
      @data("User creation form")
      model CreateUserForm {
        name: string;
      }
    `,
      "create_user_form.py",
    );

    expect(output).toContain('"""User creation form"""');
  });
});
