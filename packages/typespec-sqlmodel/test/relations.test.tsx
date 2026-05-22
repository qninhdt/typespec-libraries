import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel one-to-many relationships", () => {
  it("generates Relationship with back_populates and FK cascade", async () => {
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

  it("does not infer delete-orphan ownership from DB cascade", async () => {
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

    expect(output).toContain('back_populates="user"');
    expect(output).not.toContain("delete-orphan");
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

  it("uses exact mapped FK column names when applying relation metadata", async () => {
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
        @map("ownerId")
        ownerId: uuid;
        @foreignKey("ownerId")
        @onDelete("CASCADE")
        user: User;
      }
    `,
      "post.py",
    );

    expect(output).toContain("ownerId: UUID = Field(");
    expect(output).toContain('ForeignKey("users.id", ondelete="CASCADE")');
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

describe("SQLModel relationship sa_relationship_kwargs", () => {
  it("emits foreign_keys when two FKs point at the same parent", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
      }

      @table
      model Message {
        @key id: uuid;
        senderId: uuid;
        recipientId: uuid;
        @foreignKey("senderId")
        sender: User;
        @foreignKey("recipientId")
        recipient: User;
      }
    `,
      "message.py",
    );

    // Both navs target the same User parent; SQLAlchemy needs explicit
    // foreign_keys to disambiguate.
    expect(output).toContain('"foreign_keys": "Message.sender_id"');
    expect(output).toContain('"foreign_keys": "Message.recipient_id"');
  });

  it("emits passive_deletes and cascade kwargs on the parent collection when child FK uses onDelete cascade", async () => {
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
        @onDelete("CASCADE")
        user: User;
      }
    `,
      "user.py",
    );

    // Without passive_deletes the ORM bypasses the DB-level CASCADE.
    expect(output).toContain('"passive_deletes": True');
    expect(output).toContain('"cascade": "all, delete"');
  });

  it("m2m emits back_populates on both sides", async () => {
    const left = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @manyToMany("user_roles")
        roles: Role[];
      }

      @table
      model Role {
        @key id: uuid;
        @manyToMany("user_roles")
        users: User[];
      }
    `,
      "user.py",
    );

    const right = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @manyToMany("user_roles")
        roles: Role[];
      }

      @table
      model Role {
        @key id: uuid;
        @manyToMany("user_roles")
        users: User[];
      }
    `,
      "role.py",
    );

    expect(left).toContain('back_populates="users"');
    expect(right).toContain('back_populates="roles"');
  });
});

describe("SQLModel forward-ref future annotations", () => {
  it("emits `from __future__ import annotations` as the first import in model files", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
      }
    `,
      "user.py",
    );

    const headerIdx = output.indexOf("# Source: https://github.com/qninhdt/typespec-libraries");
    const futureIdx = output.indexOf("from __future__ import annotations");
    const firstFromIdx = output.indexOf("\nfrom ", headerIdx);

    expect(futureIdx).toBeGreaterThan(headerIdx);
    expect(futureIdx).toBe(firstFromIdx + 1);
  });
});
