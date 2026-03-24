import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("GORM field constraints", () => {
  it("generates not null for required fields, omits for optional", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        bio?: string;
      }
    `,
      "user.go",
    );

    // Required field must have "not null"
    const nameLine = output.split("\n").find((l) => l.includes("Name string"));
    expect(nameLine).toBeDefined();
    expect(nameLine).toContain("not null");

    // Optional field must NOT have "not null"
    const bioLine = output.split("\n").find((l) => l.includes("Bio "));
    expect(bioLine).toBeDefined();
    expect(bioLine).not.toContain("not null");
  });

  it("generates @index as GORM index tag", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @index email: string;
      }
    `,
      "user.go",
    );

    const emailLine = output.split("\n").find((l) => l.includes("Email "));
    expect(emailLine).toContain("index");
  });

  it("generates @index with custom name", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @index("idx_users_email") email: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain("index:idx_users_email");
  });

  it("generates @unique as uniqueIndex tag", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @unique email: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain("uniqueIndex");
  });

  it("generates @maxLength as varchar(N) and max= validator", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @maxLength(100) name: string;
      }
    `,
      "user.go",
    );

    // GORM type
    expect(output).toContain("type:varchar(100)");
    // Validator
    expect(output).toContain("max=100");
  });

  it("generates @minLength as min= validator", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @minLength(2) name: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain("min=2");
  });

  it("generates @precision as numeric(p,s) GORM type", async () => {
    const output = await emitGoFile(
      `
      @table
      model Product {
        @key id: uuid;
        @precision(10, 2) price: decimal;
      }
    `,
      "product.go",
    );

    expect(output).toContain("type:numeric(10,2)");
  });

  it("generates TypeSpec default value as GORM default tag", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        credits: int32 = 0;
        isActive: boolean = true;
      }
    `,
      "user.go",
    );

    expect(output).toContain("default:0");
    expect(output).toContain("default:true");
  });

  it("generates @map as custom column name", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @map("user_name") name: string;
      }
    `,
      "user.go",
    );

    // Should use the mapped column name, not the camelToSnake default
    expect(output).toContain("column:user_name");
  });

  it("generates @format email as email validator", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @format("email") email: string;
      }
    `,
      "user.go",
    );

    const emailLine = output.split("\n").find((l) => l.includes("Email "));
    expect(emailLine).toContain("email");
  });

  it("generates @format url as url validator", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @format("url") website?: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain("url");
  });

  it("generates @minValue/@maxValue as gte=/lte= validators", async () => {
    const output = await emitGoFile(
      `
      @table
      model Product {
        @key id: uuid;
        @minValue(0) @maxValue(999) quantity: int32;
      }
    `,
      "product.go",
    );

    expect(output).toContain("gte=0");
    expect(output).toContain("lte=999");
  });

  it("generates @pattern as regexp= validator", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @pattern("^[A-Za-z]+$") code: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain("regexp=^[A-Za-z]+$");
  });

  it('generates @ignore as gorm:"-" (not persisted)', async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        @ignore computed?: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain('gorm:"-"');
    // @ignore field should NOT have gorm column/type tags
    const computedLine = output.split("\n").find((l) => l.includes("Computed "));
    expect(computedLine).not.toContain("column:");
    expect(computedLine).not.toContain("type:");
  });

  it("generates json tag with omitempty for optional fields", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        bio?: string;
      }
    `,
      "user.go",
    );

    // Required -no omitempty
    expect(output).toContain('json:"name"');
    // Optional -omitempty
    expect(output).toContain('json:"bio,omitempty"');
  });

  it("generates required validate for required fields, omitempty for optional", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        bio?: string;
      }
    `,
      "user.go",
    );

    const nameLine = output.split("\n").find((l) => l.includes("Name "));
    expect(nameLine).toContain('validate:"required"');

    const bioLine = output.split("\n").find((l) => l.includes("Bio "));
    expect(bioLine).toContain("omitempty");
  });

  it("generates @doc as Go comment and GORM comment tag", async () => {
    const output = await emitGoFile(
      `
      /** A registered user */
      @table
      model User {
        @key id: uuid;
        /** The user's email */
        email: string;
      }
    `,
      "user.go",
    );

    // Model doc → Go comment
    expect(output).toContain("// User A registered user");
    // Field doc → Go comment above field
    expect(output).toContain("\t// The user's email");
    // Field doc → GORM comment tag
    expect(output).toContain("comment:The user's email");
  });
});

describe("GORM primary key generation", () => {
  it("generates uuid PK with default gen_random_uuid()", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
      }
    `,
      "user.go",
    );

    expect(output).toContain("primaryKey");
    expect(output).toContain("default:gen_random_uuid()");
  });

  it("generates serial PK with autoIncrement", async () => {
    const output = await emitGoFile(
      `
      @table
      model Post {
        @key id: serial;
      }
    `,
      "post.go",
    );

    expect(output).toContain("primaryKey");
    expect(output).toContain("autoIncrement");
  });
});

describe("GORM struct and file generation", () => {
  it("generates file header, package, struct, and TableName()", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
      }
    `,
      "user.go",
    );

    // Header
    expect(output).toContain("// Code generated by @qninhdt/typespec-orm. DO NOT EDIT.");
    expect(output).toContain("// Source: https://github.com/qninhdt/typespec-libraries");
    // Package
    expect(output).toContain("package test");
    // Struct
    expect(output).toContain("type User struct {");
    // TableName
    expect(output).toContain("func (User) TableName() string {");
    expect(output).toContain('\treturn "users"');
  });

  it("generates correct table name with custom @table name", async () => {
    const output = await emitGoFile(
      `
      @table("my_users")
      model User {
        @key id: uuid;
      }
    `,
      "user.go",
    );

    expect(output).toContain('\treturn "my_users"');
  });
});

describe("GORM value constraints", () => {
  it("generates min/max for @minValue/@maxValue", async () => {
    const output = await emitGoFile(
      `
      @table
      model Test {
        @key id: uuid;
        @minValue(0) @maxValue(100)
        quantity: int32;
      }
    `,
      "test.go",
    );
    expect(output).toContain("gte=0");
    expect(output).toContain("lte=100");
  });

  it("generates min/max for @minValueExclusive/@maxValueExclusive", async () => {
    const output = await emitGoFile(
      `
      @table
      model Test {
        @key id: uuid;
        @minValueExclusive(0) @maxValueExclusive(100)
        quantity: int32;
      }
    `,
      "test.go",
    );
    expect(output).toContain("gt=0");
    expect(output).toContain("lt=100");
  });

  it("generates min/max for @minItems/@maxItems", async () => {
    const output = await emitGoFile(
      `
      @table
      model Test {
        @key id: uuid;
        @minItems(1) @maxItems(10)
        items: string[];
      }
    `,
      "test.go",
    );
    expect(output).toContain("min=1");
    expect(output).toContain("max=10");
  });
});
