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
        userId: uuid;
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
        userId: uuid;
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

    // FK field should point to users.id (PK)
    expect(output).toContain('ForeignKey("users.id", ondelete="CASCADE")');
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

  it("uses explicit referenced columns for FK fields", async () => {
    const output = await emitPyFile(
      `
      @table
      model Organization {
        @key
        @unique
        code: string;
      }

      @table
      model User {
        @key id: uuid;
        organizationCode: string;
        @foreignKey("organizationCode", "code")
        organization: Organization;
      }
    `,
      "user.py",
    );

    expect(output).toContain('foreign_key="organizations.code"');
    expect(output).toContain("organization_code: str");
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

  it("uses the referenced target field in remote_side for non-id self references", async () => {
    const output = await emitPyFile(
      `
      @table
      model StoryNode {
        @key id: uuid;
        @unique code: string;
        parentCode?: string;
        @foreignKey("parentCode", "code")
        parent?: StoryNode;
      }
    `,
      "story_node.py",
    );

    expect(output).toContain('foreign_key="story_nodes.code"');
    expect(output).toContain('sa_relationship_kwargs={"remote_side": "StoryNode.code"}');
  });
});

describe("SQLModel collection strategies", () => {
  it("persists arrays as JSONB when configured", async () => {
    const output = await emitPyFile(
      `
      @table
      model StoryNode {
        @key id: uuid;
        tags: string[];
      }
    `,
      "story_node.py",
      "models",
      { "collection-strategy": "jsonb" },
    );

    expect(output).toContain("tags: list[str] = Field(");
    expect(output).toContain("sa_column=Column(JSONB, nullable=False)");
  });

  it("persists arrays as PostgreSQL arrays when configured", async () => {
    const output = await emitPyFile(
      `
      @table
      model StoryNode {
        @key id: uuid;
        tags: string[];
      }
    `,
      "story_node.py",
      "models",
      { "collection-strategy": "postgres" },
    );

    expect(output).toContain("tags: list[str] = Field(");
    expect(output).toContain("sa_column=Column(ARRAY(String), nullable=False)");
  });
});
