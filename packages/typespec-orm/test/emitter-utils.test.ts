import { describe, expect, it } from "vitest";
import {
  buildCompositeUniqueColumns,
  classifyProperties,
  collectCompositeTypeFields,
  deduplicateParts,
} from "../src/emitter-utils.js";
import { collectTableModels } from "../src/helpers.js";
import { createTestRunner } from "./utils.js";

describe("deduplicateParts", () => {
  it("preserves order while removing duplicates", () => {
    expect(deduplicateParts(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });
});

describe("collectCompositeTypeFields", () => {
  it("collects composite metadata and generated names", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @index fullName: composite<"firstName", "lastName">;
        @unique contactKey: composite<"email", "deletedAt">;
      }
    `);
    const user = collectTableModels(runner.program)[0]?.model;
    expect(user).toBeDefined();
    if (!user) {
      throw new Error("Expected generated test model");
    }

    const composites = collectCompositeTypeFields(runner.program, user, "users");
    expect(composites).toEqual([
      {
        name: "users_first_name_last_name_idx",
        columns: ["firstName", "lastName"],
        isUnique: false,
        isPrimary: false,
      },
      {
        name: "users_email_deleted_at_unique",
        columns: ["email", "deletedAt"],
        isUnique: true,
        isPrimary: false,
      },
    ]);
  });

  it("builds composite unique column set in snake_case", () => {
    const result = buildCompositeUniqueColumns([
      {
        name: "users_email_deleted_at_unique",
        columns: ["email", "deletedAt"],
        isUnique: true,
        isPrimary: false,
      },
      {
        name: "users_name_idx",
        columns: ["name"],
        isUnique: false,
        isPrimary: false,
      },
    ]);

    expect([...result]).toEqual(["email", "deleted_at"]);
  });
});

describe("classifyProperties", () => {
  it("buckets ignored, relation, enum, and regular properties", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      enum Role {
        admin: "admin",
        user: "user",
      }

      @table
      model Team {
        @key id: uuid;
      }

      @table
      model User {
        @test @key id: uuid;
        @test role: Role;
        @test @ignore computed?: string;
        teamId: uuid;
        @test @foreignKey("teamId") team: Team;
      }
    `);
    const user = collectTableModels(runner.program).find(
      (item) => item.model.name === "User",
    )?.model;
    expect(user).toBeDefined();
    if (!user) {
      throw new Error("Expected User model");
    }
    const classified = classifyProperties(runner.program, user);

    expect([...classified.enumTypes.keys()]).toEqual(["Role"]);
    expect(classified.ignored.map((item) => item.prop.name)).toEqual(["computed"]);
    expect(classified.relations.map((item) => item.prop.name)).toEqual(["team"]);
    expect(classified.fields.map((item) => item.prop.name)).toEqual(["id", "role", "teamId"]);
  });

  it("skips unresolved relation decorators from regular fields", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @mappedBy("missing") posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
      }
    `);
    const user = collectTableModels(runner.program).find(
      (item) => item.model.name === "User",
    )?.model;
    expect(user).toBeDefined();
    if (!user) {
      throw new Error("Expected User model");
    }

    const classified = classifyProperties(runner.program, user);
    expect(classified.relations).toHaveLength(0);
    expect(classified.fields).toHaveLength(1);
    expect(classified.fields[0].prop.name).toBe("id");
  });
});
