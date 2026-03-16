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
  @foreignKey("parent_id")
  parent?: Category;
}
`,
      "categories.dbml",
    );
    expect(output).toContain("Ref: categories.parent_id > categories.id");
  });

  it("generates one-to-one reference", async () => {
    const output = await emitDbmlFile(
      `
@table
model User {
  @key id: uuid;
  @mappedBy("owner")
  passport?: Passport;
}

@table
model Passport {
  @key ownerId: uuid;
  passportNumber: string;
  @foreignKey("owner_id")
  owner: User;
}
`,
      "passports.dbml",
    );
    // One-to-one: passports.owner_id > users.id (FK on passports)
    expect(output).toContain("Ref: passports.owner_id > users.id");
  });
});
