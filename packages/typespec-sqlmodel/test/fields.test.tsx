import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel field generation", () => {
  it("generates soft delete as optional datetime", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        deletedAt?: utcDateTime;
      }
    `,
      "user.py",
    );

    expect(output).toContain("deleted_at:");
    expect(output).toContain("datetime | None");
  });

  it("generates UUID field with default_factory", async () => {
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

    expect(output).toContain("default_factory=uuid4");
  });

  it("generates numeric range with inclusive bounds", async () => {
    const output = await emitPyFile(
      `
      @table
      model Product {
        @key id: uuid;
        @minValue(0) @maxValue(100) rating: int32;
      }
    `,
      "product.py",
    );

    expect(output).toContain("ge=0");
    expect(output).toContain("le=100");
  });

  it("generates numeric range with exclusive bounds", async () => {
    const output = await emitPyFile(
      `
      @table
      model Product {
        @key id: uuid;
        @minValueExclusive(0) @maxValueExclusive(100) score: float64;
      }
    `,
      "product.py",
    );

    expect(output).toContain("gt=0");
    expect(output).toContain("lt=100");
  });

  it("generates string length constraints", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @minLength(1) @maxLength(255) name: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("min_length=1");
    expect(output).toContain("max_length=255");
  });

  it("generates foreign key with cascade constraints", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @mappedBy("user")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        userId: uuid;
        @foreignKey("userId")
        @onDelete("CASCADE")
        user: User;
      }
    `,
      "post.py",
    );

    expect(output).toContain("ForeignKey");
    expect(output).toContain("CASCADE");
  });

  it("generates auto-create timestamp with server_default", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @autoCreateTime createdAt: utcDateTime;
      }
    `,
      "user.py",
    );

    expect(output).toContain("created_at:");
    expect(output).toContain("server_default");
  });

  it("generates optional field as nullable", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        bio?: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("bio:");
    expect(output).toContain("| None");
  });
});

describe("SQLModel relation fields", () => {
  it("generates many-to-one relation with back_populates", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @mappedBy("user")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        userId: uuid;
        @foreignKey("userId")
        user: User;
      }
    `,
      "post.py",
    );

    expect(output).toContain("Relationship");
    expect(output).toContain('back_populates="posts"');
  });

  it("generates one-to-many relation with list type", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @mappedBy("user")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        userId: uuid;
        @foreignKey("userId")
        user: User;
      }
    `,
      "user.py",
    );

    expect(output).toContain("Relationship");
    expect(output).toContain('back_populates="user"');
    expect(output).toContain("Post");
  });

  it("generates one-to-one relation with optional type", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @mappedBy("user")
        profile?: Profile;
      }

      @table
      model Profile {
        @key id: uuid;
        @unique userId: uuid;
        @foreignKey("userId")
        user: User;
      }
    `,
      "user.py",
    );

    expect(output).toContain("Relationship");
    expect(output).toContain('back_populates="user"');
  });
});
