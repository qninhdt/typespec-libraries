import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel one-to-many relationships", () => {
  it("generates Relationship with back_populates and cascade", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @id id: uuid;
        name: string;
        posts: Post[];
      }

      @table
      model Post {
        @id id: uuid;
        title: string;
        @onDelete("CASCADE") @onUpdate("CASCADE")
        user: User;
      }
    `,
      "user.py",
    );

    expect(output).toContain("# ─── Relationships ─────────────────────");
    expect(output).toContain('posts: list["Post"]');
    expect(output).toContain("Relationship(");
    expect(output).toContain("from sqlmodel import");
    expect(output).toContain("Relationship");
  });

  it('generates cascade="all, delete-orphan" for CASCADE parent', async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @id id: uuid;
        posts: Post[];
      }

      @table
      model Post {
        @id id: uuid;
        @onDelete("CASCADE") user: User;
      }
    `,
      "user.py",
    );

    expect(output).toContain('cascade="all, delete-orphan"');
  });
});

describe("SQLModel many-to-one relationships", () => {
  it("generates auto FK field with ForeignKey and cascade", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @id id: uuid;
        name: string;
        posts: Post[];
      }

      @table
      model Post {
        @id id: uuid;
        title: string;
        @onDelete("CASCADE") @onUpdate("CASCADE")
        user: User;
      }
    `,
      "post.py",
    );

    // Auto-injected FK field
    expect(output).toContain("user_id: UUID");
    expect(output).toContain("ForeignKey(");
    expect(output).toContain('ondelete="CASCADE"');
    expect(output).toContain('onupdate="CASCADE"');

    // Navigation relationship
    expect(output).toContain('user: "User" | None');
    expect(output).toContain("Relationship(");
  });
});

describe("SQLModel optional relationships", () => {
  it("generates nullable FK for optional relation", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @id id: uuid;
      }

      @table
      model Post {
        @id id: uuid;
        author?: User;
      }
    `,
      "post.py",
    );

    expect(output).toContain("author_id: UUID | None");
    expect(output).toContain("default=None");
  });
});
