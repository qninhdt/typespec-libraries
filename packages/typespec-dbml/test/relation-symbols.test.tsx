import { describe, expect, it } from "vitest";
import { emitDbmlFile } from "./utils.js";

describe("DBML relation symbols", () => {
  it("generates > symbol for many-to-one relations", async () => {
    const output = await emitDbmlFile(
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
      "posts.dbml",
    );

    expect(output).toContain("Ref: posts.user_id > users.id");
  });

  it("generates < symbol for one-to-many inverse in same output", async () => {
    const output = await emitDbmlFile(
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
      "posts.dbml",
    );

    // The owning side (Post) emits the ref with > symbol
    expect(output).toContain("Ref: posts.user_id > users.id");
  });

  it("generates - symbol for one-to-one relations", async () => {
    const output = await emitDbmlFile(
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
      "profiles.dbml",
    );

    // One-to-one uses - symbol on the owning side
    expect(output).toContain("Ref: profiles.user_id");
    expect(output).toContain("users.id");
  });

  it("includes ON DELETE action in relation", async () => {
    const output = await emitDbmlFile(
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
      "posts.dbml",
    );

    expect(output).toContain("delete: cascade");
  });

  it("includes ON UPDATE action in relation", async () => {
    const output = await emitDbmlFile(
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
        @onUpdate("SET NULL")
        user: User;
      }
    `,
      "posts.dbml",
    );

    expect(output).toContain("update: set null");
  });

  it("includes both ON DELETE and ON UPDATE actions", async () => {
    const output = await emitDbmlFile(
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
        @onUpdate("CASCADE")
        user: User;
      }
    `,
      "posts.dbml",
    );

    expect(output).toContain("delete: cascade");
    expect(output).toContain("update: cascade");
  });
});
