import { describe, expect, it } from "vitest";
import { emitGoFile } from "../utils.jsx";

describe("GORM emitter end-to-end", () => {
  it("emits a complete table model with scalar constraints and managed timestamps", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @maxLength(255) name: string;
        @unique @format("email") email: string;
        age?: int32;
        @autoCreateTime createdAt: utcDateTime;
        @autoUpdateTime updatedAt: utcDateTime;
      }
    `,
      "user.go",
    );

    expect(output).toContain("type User struct {");
    expect(output).toContain("ID uuid.UUID");
    expect(output).toContain("primaryKey");
    expect(output).toContain("default:gen_random_uuid()");
    expect(output).toContain("Name string");
    expect(output).toContain("type:varchar(255)");
    expect(output).toContain('validate:"required,max=255"');
    expect(output).toContain("Email string");
    expect(output).toContain("uniqueIndex");
    expect(output).toContain('validate:"required,email"');
    expect(output).toContain("Age *int32");
    expect(output).toContain("CreatedAt time.Time");
    expect(output).toContain("autoCreateTime");
    expect(output).toContain("UpdatedAt time.Time");
    expect(output).toContain("autoUpdateTime");
    expect(output).toContain("func (User) TableName() string {");
    expect(output).toContain('return "users"');
  });

  it("emits table models with enum fields and bidirectional relationships", async () => {
    const code = `
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
    `;

    const user = await emitGoFile(code, "user.go");
    const post = await emitGoFile(code, "post.go");

    expect(user).toContain("type Status string");
    expect(user).toContain('StatusActive Status = "active"');
    expect(user).toContain('StatusInactive Status = "inactive"');
    expect(user).toContain("Status Status");
    expect(user).toContain("Posts []Post");
    expect(user).toContain("foreignKey:UserID;references:ID");
    expect(post).toContain("Content string");
    expect(post).toContain("type:text");
    expect(post).toContain("UserID uuid.UUID");
    expect(post).toContain("User User");
    expect(post).toContain("constraint:OnDelete:CASCADE");
  });

  it("emits @data model as a DTO with validation, json, and form tags", async () => {
    const output = await emitGoFile(
      `
      @data("Registration Form")
      model RegisterForm {
        @title("Full Name") @minLength(1) name: string;
        @title("Email") @format("email") email: string;
        @title("Password") @minLength(8) password: string;
      }
    `,
      "register_form.go",
    );

    expect(output).toContain("type RegisterForm struct {");
    expect(output).toContain('validate:"required,min=1" json:"name" form:"name,title=Full Name"');
    expect(output).toContain('validate:"required,email" json:"email" form:"email,title=Email"');
    expect(output).toContain(
      'validate:"required,min=8" json:"password" form:"password,title=Password"',
    );
    expect(output).not.toContain("TableName()");
  });

  it("emits composite index and unique tags on participating fields", async () => {
    const output = await emitGoFile(
      `
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
    `,
      "product.go",
    );

    expect(output).toContain("index:products_name_email_idx,priority:1");
    expect(output).toContain("index:products_name_email_idx,priority:2");
    expect(output).toContain("uniqueIndex:products_code_version_unique,priority:1");
    expect(output).toContain("uniqueIndex:products_code_version_unique,priority:2");
    expect(output).not.toContain("IdxNameEmail");
    expect(output).not.toContain("UnqCodeVer");
  });

  it("emits decorator-driven tags for mapped, numeric, soft delete, and timestamp fields", async () => {
    const output = await emitGoFile(
      `
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
    `,
      "user.go",
    );

    expect(output).toContain('validate:"required,max=255,min=1"');
    expect(output).toContain('validate:"required,email"');
    expect(output).toContain("Age *int32");
    expect(output).toContain("lte=200");
    expect(output).toContain("gte=0");
    expect(output).toContain("column:user_role");
    expect(output).toContain("index");
    expect(output).toContain("Balance *decimal.Decimal");
    expect(output).toContain("type:numeric(10,2)");
    expect(output).toContain("DeletedAt gorm.DeletedAt");
    expect(output).toContain("autoCreateTime");
    expect(output).toContain("autoUpdateTime");
  });

  it("emits standalone module manifests with namespace-based imports", async () => {
    const code = `
      namespace App.Identity {
        @table
        model User {
          @key id: uuid;
          name: string;
        }
      }
    `;
    const options = {
      standalone: true,
      "library-name": "github.com/acme/domain-models",
    };

    const mod = await emitGoFile(code, "go.mod", "test", options);
    const manifest = await emitGoFile(code, "models.go", "test", options);
    const user = await emitGoFile(code, "user.go", "test", options);

    expect(mod).toContain("module github.com/acme/domain-models");
    expect(manifest).toContain("package domain_models");
    expect(manifest).toContain('"gorm.io/gorm"');
    expect(manifest).toContain(
      'test_app_identity "github.com/acme/domain-models/test/app/identity"',
    );
    expect(manifest).toContain("&test_app_identity.User{}");
    expect(user).toContain("package identity");
    expect(user).toContain("type User struct");
  });
});
