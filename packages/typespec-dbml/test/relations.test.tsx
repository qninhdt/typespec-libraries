/**
 * Relation/FK tests.
 */

import { describe, expect, it } from "vitest";
import { emitDbmlFile } from "./utils.js";

describe("DBML relations", () => {
  it("generates many-to-one reference", async () => {
    const output = await emitDbmlFile(
      `
@table
model User {
  @key id: uuid;
  name: string;
}

@table
model Post {
  @key id: uuid;
  authorId: uuid;
  @foreignKey("author_id")
  author: User;
}
`,
      "posts.dbml",
    );
    // DBML format: source.fk > target.pk
    expect(output).toContain("Ref: posts.author_id > users.id");
  });

  it("generates one-to-many reference", async () => {
    const output = await emitDbmlFile(
      `
@table
model User {
  @key id: uuid;
  @mappedBy("author")
  posts: Post[];
}

@table
model Post {
  @key id: uuid;
  authorId: uuid;
  @foreignKey("author_id")
  author: User;
}
`,
      "posts.dbml",
    );
    // One-to-many references are on the many side (Post has the FK)
    expect(output).toContain("Ref: posts.author_id > users.id");
  });

  it("generates self-referential reference", async () => {
    const output = await emitDbmlFile(
      `
@table
model Category {
  @key id: uuid;
  name: string;
  parentId?: uuid;
  @foreignKey("parent_id")
  parent?: Category;
}
`,
      "categories.dbml",
    );
    expect(output).toContain("Ref: categories.parent_id > categories.id");
  });

  it("generates a referenced-column relation", async () => {
    const output = await emitDbmlFile(
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
      "users.dbml",
    );
    expect(output).toContain("Ref: users.organization_code > organizations.code");
  });

  it("preserves delete and update actions on references", async () => {
    const output = await emitDbmlFile(
      `
@table
model User {
  @key id: uuid;
}

@table
model Post {
  @key id: uuid;
  authorId: uuid;
  @foreignKey("authorId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  author: User;
}
`,
      "posts.dbml",
    );
    expect(output).toContain("Ref: posts.author_id > users.id [delete: CASCADE, update: CASCADE]");
  });

  it("keeps indexes for enum columns", async () => {
    const output = await emitDbmlFile(
      `
enum SubscriptionPlan {
  free: "free",
  premium: "premium",
}

@table
model Subscription {
  @key id: uuid;
  @index plan: SubscriptionPlan;
}
`,
      "subscriptions.dbml",
    );
    expect(output).toContain("plan SubscriptionPlan");
    expect(output).toContain("indexes {");
    expect(output).toContain("    plan");
  });
});
