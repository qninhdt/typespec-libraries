import { describe, expect, it } from "vitest";
import { createEmitterTestRunner } from "../utils.jsx";

describe("SQLModel emitter end-to-end", () => {
  it("emits a complete SQLModel file without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @table
      model User {
        @id id: uuid;
        @maxLength(255) name: string;
        @unique @format("email") email: string;
        age?: int32;
        @autoCreateTime createdAt: utcDateTime;
        @autoUpdateTime updatedAt: utcDateTime;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits model with relations and enums without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      enum Status {
        active: "active",
        inactive: "inactive",
      }

      @table
      model User {
        @id id: uuid;
        name: string;
        status: Status;
        @relation("one-to-many") posts: Post[];
      }

      @table
      model Post {
        @id id: uuid;
        title: string;
        content: text;
        @relation("many-to-one") @onDelete("CASCADE") user: User;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits @data model as Pydantic BaseModel without errors", async () => {
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

  it("emits model with composite indexes without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @table
      @compositeIndex("idx_name_email", "name", "email")
      @compositeUnique("unq_code_ver", "code", "version")
      model Product {
        @id id: uuid;
        name: string;
        email: string;
        code: string;
        version: int32;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits __init__.py with all model exports without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @table
      model User {
        @id id: uuid;
        name: string;
      }

      @table
      model Post {
        @id id: uuid;
        title: string;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });
});
