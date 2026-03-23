import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel one-to-many relationships", () => {
  it("generates Relationship with back_populates and cascade", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        @mappedBy("user")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        title: string;
        @foreignKey("user_id")
        @onDelete("CASCADE") @onUpdate("CASCADE")
        user: User;
      }
    `,
      "user.py",
    );

    expect(output).toContain("# ─── Relationships ─────────────────────");
    expect(output).toContain("posts: list[Post]");
    expect(output).toContain("Relationship(");
    expect(output).toContain("from sqlmodel import");
    expect(output).toContain("Relationship");
  });

  it('generates cascade="all, delete-orphan" for CASCADE parent', async () => {
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
        @foreignKey("user_id")
        @onDelete("CASCADE") user: User;
      }
    `,
      "user.py",
    );

    expect(output).toContain('"cascade": "all, delete-orphan"');
  });

  it("FK field has foreign_key reference to target table's PK", async () => {
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
        @map("user_id")
        userId: uuid;
        @foreignKey("user_id")
        @onDelete("CASCADE")
        user: User;
      }
    `,
      "post.py",
    );

    // FK field should have foreign_key pointing to users.id (PK)
    expect(output).toContain('foreign_key="users.id"');
    // Relationship should NOT have foreign_keys in sa_relationship_kwargs
    expect(output).not.toContain("foreign_keys");
  });

  it("Relationship does NOT include foreign_keys when FK is explicit", async () => {
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
        @map("user_id")
        userId: uuid;
        @foreignKey("user_id")
        user: User;
      }
    `,
      "post.py",
    );

    // Should have back_populates pointing to the array field name ("posts") but NOT foreign_keys in Relationship
    expect(output).toContain('Relationship(back_populates="posts")');
    expect(output).not.toContain("sa_relationship_kwargs");
  });
});

describe("SQLModel many-to-one relationships", () => {
  it("generates FK field with ForeignKey and cascade", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        @mappedBy("author")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        title: string;
        authorId: uuid;
        @foreignKey("authorId")
        @onDelete("CASCADE") @onUpdate("CASCADE")
        author: User;
      }
    `,
      "post.py",
    );

    // FK field (explicit)
    expect(output).toContain("author_id: UUID");

    // Navigation relationship
    expect(output).toContain("author: User | None");
    expect(output).toContain("Relationship(");
  });
});

describe("SQLModel optional relationships", () => {
  it("generates nullable FK for optional relation", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
      }

      @table
      model Post {
        @key id: uuid;
        authorId?: uuid;
        @foreignKey("authorId")
        author?: User;
      }
    `,
      "post.py",
    );
    // Explicit FK field
    expect(output).toContain("author_id: UUID | None");
    expect(output).toContain("default=None");
  });
});

describe("SQLModel self-referential relationships", () => {
  it("generates remote_side pointing to PK (id), not FK column", async () => {
    const output = await emitPyFile(
      `
      @table
      model StoryNode {
        @key id: uuid;
        content: string;
        parentId?: uuid;
        @foreignKey("parentId")
        parent?: StoryNode;
      }
    `,
      "story_node.py",
    );

    // remote_side should point to StoryNode.id (the PK), not parentId
    expect(output).toContain('sa_relationship_kwargs={"remote_side": "StoryNode.id"}');
    // Should NOT have foreign_keys in the relationship
    expect(output).not.toContain("foreign_keys");
  });
});
