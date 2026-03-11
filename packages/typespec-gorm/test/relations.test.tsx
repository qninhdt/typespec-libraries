import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("GORM one-to-many relationships", () => {
  it("generates []TargetModel field with foreignKey tag", async () => {
    const output = await emitGoFile(
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
      "user.go",
    );

    // Relationship separator
    expect(output).toContain("// ─── Relationships ─────────────────────");
    // Slice field
    expect(output).toContain("Posts []Post");
    // foreignKey tag pointing to FK field on Post
    expect(output).toContain("foreignKey:UserID");
  });

  it("generates cascade constraint when child has @onDelete/@onUpdate", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @id id: uuid;
        posts: Post[];
      }

      @table
      model Post {
        @id id: uuid;
        @onDelete("CASCADE") @onUpdate("CASCADE")
        user: User;
      }
    `,
      "user.go",
    );

    expect(output).toContain("constraint:OnDelete:CASCADE,OnUpdate:CASCADE");
  });
});

describe("GORM many-to-one relationships", () => {
  it("generates auto-injected FK field and navigation field", async () => {
    const output = await emitGoFile(
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
      "post.go",
    );

    // Auto-injected FK field
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
        @id id: uuid;
        posts: Post[];
      }

      @table
      model Post {
        @id id: uuid;
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
});

describe("GORM optional relationships", () => {
  it("generates pointer FK for optional relation", async () => {
    const output = await emitGoFile(
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
      "post.go",
    );

    // Optional FK should be pointer
    expect(output).toMatch(/Author\w+ \*uuid\.UUID/);
  });
});

describe("GORM FK field naming", () => {
  it("uses relation name + ID as FK field name", async () => {
    const output = await emitGoFile(
      `
      @table
      model World {
        @id id: uuid;
        events: GameEvent[];
      }

      @table
      model GameEvent {
        @id id: uuid;
        @onDelete("CASCADE") @onUpdate("CASCADE")
        world: World;
      }
    `,
      "game_event.go",
    );

    // FK field named WorldID (relation name "world" → "WorldID")
    expect(output).toContain("WorldID uuid.UUID");
    expect(output).toContain("column:world_id");
  });
});
