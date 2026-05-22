import { describe, expect, it } from "vitest";
import { emitPyFile, renderPyOutput } from "./utils.jsx";
import { getOutputFileContent } from "@qninhdt/typespec-orm/testing";

describe("SQLModel field constraints", () => {
  it("generates index=True for @index", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @index email: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("index=True");
  });

  it("generates unique=True for @unique", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @unique email: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("unique=True");
  });

  it("generates max_length for @maxLength", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @maxLength(100) name: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("max_length=100");
  });

  it("generates default max_length=255 for plain string", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("max_length=255");
  });

  it("generates Numeric(p,s) for @precision on decimal", async () => {
    const output = await emitPyFile(
      `
      @table
      model Product {
        @key id: uuid;
        @precision(10, 2) price: decimal;
      }
    `,
      "product.py",
    );

    expect(output).toContain("Numeric(10, 2)");
    expect(output).toContain("from sqlalchemy import");
    expect(output).toContain("Numeric");
  });

  it("generates server_default for default values", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        credits: int32 = 0;
      }
    `,
      "user.py",
    );

    expect(output).toContain('"server_default"');
    expect(output).toContain('"0"');
  });

  it("preserves empty string server defaults", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        displayName: string = "";
      }
    `,
      "user.py",
    );

    expect(output).toContain('"server_default": ""');
  });

  it("generates nullable=False in sa_column_kwargs for required fields", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain('"nullable": False');
  });

  it("generates min_length for @minLength", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @minLength(2) name: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("min_length=2");
  });

  it("generates ge/le for @minValue/@maxValue", async () => {
    const output = await emitPyFile(
      `
      @table
      model Product {
        @key id: uuid;
        @minValue(0) @maxValue(999) quantity: int32;
      }
    `,
      "product.py",
    );

    expect(output).toContain("ge=0");
    expect(output).toContain("le=999");
  });

  it("generates pattern for @pattern", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @pattern("^[A-Z]+$") code: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("^[A-Z]+$");
  });

  it("generates EmailStr for email scalar", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        contact: email;
      }
    `,
      "user.py",
    );

    expect(output).toContain("EmailStr");
    expect(output).toContain("from pydantic import");
  });

  it("generates AnyUrl for url scalar", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        website?: url;
      }
    `,
      "user.py",
    );

    expect(output).toContain("AnyUrl");
    expect(output).toContain("from pydantic import");
  });

  it("generates @ignore as ClassVar (not persisted)", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @ignore computed?: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("ClassVar");
    expect(output).toContain("# @ignore - not persisted");
    expect(output).toContain("from typing import ClassVar");
  });

  it("generates @doc as sa_column comment kwarg only", async () => {
    const output = await emitPyFile(
      `
      /** A registered user */
      @table
      model User {
        @key id: uuid;
        /** The user's email */
        email: string;
      }
    `,
      "user.py",
    );

    // Model doc → docstring
    expect(output).toContain('"""A registered user"""');
    // Field doc → sa_column_kwargs comment (round-trips to DB COMMENT ON …)
    expect(output).toContain('"comment"');
    expect(output).toContain("The user's email");
    // Field doc must NOT also be emitted as a free-floating `# …` line — that
    // duplicated the same text in two places and drifted whenever one was
    // updated. Match only an indented `# The user's email\n` line so the
    // leading "Code generated …" header doesn't trip the assertion.
    expect(output).not.toMatch(/^ {4}# The user's email$/m);
  });

  it("generates inherited check constraints", async () => {
    const output = await emitPyFile(
      `
      model PositiveBalance {
        @check("balance_non_negative", "balance >= 0")
        balance: decimal;
      }

      @table
      model Account extends PositiveBalance {
        @key id: uuid;
      }
    `,
      "account.py",
    );

    expect(output).toContain('CheckConstraint("balance >= 0", name="balance_non_negative")');
    expect(output).toContain("from sqlalchemy import CheckConstraint");
  });
});

describe("SQLModel primary key generation", () => {
  it("generates uuid PK with default_factory=uuid4", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
      }
    `,
      "user.py",
    );

    expect(output).toContain("default_factory=uuid4");
    expect(output).toContain("primary_key=True");
  });
});

describe("SQLModel file structure", () => {
  it("generates header, imports, class with table=True, __tablename__", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
      }
    `,
      "user.py",
    );

    expect(output).toContain("# Code generated by @qninhdt/typespec-orm. DO NOT EDIT.");
    expect(output).toContain("# Source: https://github.com/qninhdt/typespec-libraries");
    expect(output).toContain("class User(SQLModel, table=True):");
    expect(output).toContain('__tablename__: ClassVar[str] = "users"');
  });

  it("generates correct table name with custom @table name", async () => {
    const output = await emitPyFile(
      `
      @table("my_users")
      model User {
        @key id: uuid;
      }
    `,
      "user.py",
    );

    expect(output).toContain('__tablename__: ClassVar[str] = "my_users"');
  });
});

describe("SQLModel value constraints", () => {
  it("generates min/max for @minValue/@maxValue", async () => {
    const output = await emitPyFile(
      `
      @table
      model Test {
        @key id: uuid;
        @minValue(0) @maxValue(100)
        quantity: int32;
      }
    `,
      "test.py",
    );
    expect(output).toContain("ge=0");
    expect(output).toContain("le=100");
  });

  it("generates min/max for @minValueExclusive/@maxValueExclusive", async () => {
    const output = await emitPyFile(
      `
      @table
      model Test {
        @key id: uuid;
        @minValueExclusive(0) @maxValueExclusive(100)
        quantity: int32;
      }
    `,
      "test.py",
    );
    expect(output).toContain("gt=0");
    expect(output).toContain("lt=100");
  });

  it("generates min/max for @minItems/@maxItems", async () => {
    const output = await emitPyFile(
      `
      @table
      model Test {
        @key id: uuid;
        @minItems(1) @maxItems(10)
        items: string[];
      }
    `,
      "test.py",
    );
    expect(output).toContain("min_length=1");
    expect(output).toContain("max_length=10");
  });
});

describe("SQLModel user-defined scalars", () => {
  it("inherits @minValue/@maxValue from custom scalar definition", async () => {
    const output = await renderPyOutput(`
      @minValue(18) @maxValue(150)
      scalar AdultAge extends int32;

      @table
      model User {
        @key id: uuid;
        age: AdultAge;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");

    expect(scalarsFile).toContain("ge=18");
    expect(scalarsFile).toContain("le=150");
  });

  it("inherits @minLength/@maxLength from custom scalar definition", async () => {
    const output = await renderPyOutput(`
      @minLength(8) @maxLength(128)
      scalar StrongPassword extends string;

      @table
      model User {
        @key id: uuid;
        password: StrongPassword;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");

    expect(scalarsFile).toContain("min_length=8");
    expect(scalarsFile).toContain("max_length=128");
  });

  it("inherits @pattern from custom scalar definition", async () => {
    const output = await renderPyOutput(`
      @pattern("^[A-Z]{3}-[0-9]+$")
      scalar ProductCode extends string;

      @table
      model Product {
        @key id: uuid;
        code: ProductCode;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");

    expect(scalarsFile).toContain("pattern=");
    expect(scalarsFile).toContain("^[A-Z]{3}-[0-9]+$");
  });
});
