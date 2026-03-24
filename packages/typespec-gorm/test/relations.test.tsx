import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("GORM one-to-many relationships", () => {
  it("generates []TargetModel field with foreignKey tag in PascalCase", async () => {
    const output = await emitGoFile(
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
      "user.go",
    );

    // Relationship separator
    expect(output).toContain("// ─── Relationships ─────────────────────");
    // Slice field
    expect(output).toContain("Posts []Post");
    // foreignKey tag must be PascalCase (UserID, not userId or user_id)
    expect(output).toContain("foreignKey:UserID");
    // Must NOT contain invalid rel: tag
    expect(output).not.toContain("rel:");
  });

  it("generates cascade constraint in constraint: format with comma separator", async () => {
    const output = await emitGoFile(
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
        @onDelete("CASCADE") @onUpdate("CASCADE")
        user: User;
      }
    `,
      "user.go",
    );

    // Must use constraint: format with comma separator
    expect(output).toContain("constraint:OnDelete:CASCADE,OnUpdate:CASCADE");
    // Must NOT have old semicolon format
    expect(output).not.toContain("OnDelete:CASCADE;OnUpdate:CASCADE");
  });

  it("generates correct FK field naming with @map", async () => {
    const output = await emitGoFile(
      `
      @table
      model World {
        @key id: uuid;
        @mappedBy("owner")
        worlds: GameEvent[];
      }

      @table
      model GameEvent {
        @key id: uuid;
        @map("owner_id")
        ownerId: uuid;
        @foreignKey("owner_id")
        @onDelete("CASCADE") @onUpdate("CASCADE")
        owner: World;
      }
    `,
      "game_event.go",
    );

    // FK field should be named OwnerID (PascalCase)
    expect(output).toContain("OwnerID uuid.UUID");
    // Relationship should use foreignKey:OwnerID
    expect(output).toContain("foreignKey:OwnerID");
  });
});

describe("GORM many-to-one relationships", () => {
  it("generates FK field with navigation field", async () => {
    const output = await emitGoFile(
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
        @map("user_id")
        userId: uuid;
        @foreignKey("user_id")
        @onDelete("CASCADE") @onUpdate("CASCADE")
        user: User;
      }
    `,
      "post.go",
    );

    // Explicit FK field
    expect(output).toContain("UserID uuid.UUID");
    expect(output).toContain("column:user_id");
    expect(output).toContain("type:uuid");

    // Navigation field
    expect(output).toContain("User User");
    expect(output).toContain("foreignKey:UserID");
    expect(output).toContain("constraint:OnDelete:CASCADE,OnUpdate:CASCADE");
  });

  it("generates FK field with index for indexed lookups", async () => {
    const output = await emitGoFile(
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
        @index
        userId: uuid;
        @foreignKey("user_id")
        @onDelete("CASCADE")
        user: User;
      }
    `,
      "post.go",
    );

    // FK field should be indexed
    const fkLine = output.split("\n").find((l) => l.includes("UserID "));
    expect(fkLine).toBeDefined();
  });

  it("uses explicit referenced columns in relation tags", async () => {
    const output = await emitGoFile(
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
      "user.go",
    );

    expect(output).toContain("OrganizationCode string");
    expect(output).toContain("foreignKey:OrganizationCode");
    expect(output).toContain("references:Code");
  });
});

describe("GORM optional relationships", () => {
  it("generates pointer FK for optional relation", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
      }

      @table
      model Post {
        @key id: uuid;
        @map("author_id")
        authorId?: uuid;
        @foreignKey("author_id")
        author?: User;
      }
    `,
      "post.go",
    );

    // Optional FK field should be pointer
    expect(output).toMatch(/AuthorID \*uuid\.UUID/);
  });
});

describe("GORM FK field naming", () => {
  it("uses relation name + ID as FK field name", async () => {
    const output = await emitGoFile(
      `
      @table
      model World {
        @key id: uuid;
        @mappedBy("world")
        events: GameEvent[];
      }

      @table
      model GameEvent {
        @key id: uuid;
        @map("world_id")
        worldId: uuid;
        @foreignKey("world_id")
        @onDelete("CASCADE") @onUpdate("CASCADE")
        world: World;
      }
    `,
      "game_event.go",
    );

    // FK field named WorldID (explicit property name "worldId" → "WorldID")
    expect(output).toContain("WorldID uuid.UUID");
    expect(output).toContain("column:world_id");
  });
});

describe("GORM collection strategies", () => {
  it("persists arrays as JSONB when configured", async () => {
    const output = await emitGoFile(
      `
      @table
      model StoryNode {
        @key id: uuid;
        tags: string[];
      }
    `,
      "story_node.go",
      "test",
      { "collection-strategy": "jsonb" },
    );

    expect(output).toContain("Tags datatypes.JSONSlice[string]");
    expect(output).toContain('gorm:"column:tags;type:jsonb;not null"');
  });

  it("persists arrays as PostgreSQL arrays when configured", async () => {
    const output = await emitGoFile(
      `
      @table
      model StoryNode {
        @key id: uuid;
        tags: string[];
      }
    `,
      "story_node.go",
      "test",
      { "collection-strategy": "postgres" },
    );

    expect(output).toContain("Tags []string");
    expect(output).toContain('gorm:"column:tags;type:text[];not null"');
  });
});
