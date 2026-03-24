import { describe, expect, it } from "vitest";
import { createEmitterTestRunner, renderGoOutput } from "../utils.jsx";

describe("GORM emitter end-to-end", () => {
  it("emits a complete model without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
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
        @key id: uuid;
        name: string;
        status: Status;
        @mappedBy("user")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        title: string;
        content: text;
        userId: uuid;
        @foreignKey("user_id")
        @onDelete("CASCADE")
        user: User;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits @data model without errors", async () => {
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
      model Product {
        @key id: uuid;
        name: string;
        email: string;
        code: string;
        version: int32;
        idxNameEmail: composite<"name", "email">;
        @unique
        unqCodeVer: composite<"code", "version">;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits model with all decorator features without errors", async () => {
    const runner = await createEmitterTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @maxLength(255) @minLength(1) name: string;
        @unique @format("email") email: string;
        @minValue(0) @maxValue(200) age?: int32;
        @index @map("user_role") role: string;
        @precision(10, 2) balance?: decimal;
        @softDelete deletedAt?: utcDateTime;
        @autoCreateTime createdAt: utcDateTime;
        @autoUpdateTime updatedAt: utcDateTime;
      }
    `);

    const errors = runner.program.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("emits standalone module manifests with namespace-based imports", async () => {
    const output = await renderGoOutput(
      `
      namespace App.Identity {
        @table
        model User {
          @key id: uuid;
          name: string;
        }
      }
    `,
      "test",
      {
        standalone: true,
        "library-name": "github.com/acme/domain-models",
      },
    );

    const files = JSON.stringify(output);
    expect(files).toContain("go.mod");
    expect(files).toContain("models.go");
    expect(files).toContain("github.com/acme/domain-models");
  });
});
