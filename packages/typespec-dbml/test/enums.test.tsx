/**
 * Enum tests.
 */

import { describe, expect, it } from "vitest";
import { emitDbmlFile } from "./utils.js";

describe("DBML enums", () => {
  it("generates enum definition", async () => {
    const output = await emitDbmlFile(
      `
enum PostStatus {
  draft,
  published,
  archived,
}

@table
model Post {
  @key id: uuid;
  status: PostStatus;
}
`,
      "posts.dbml",
    );
    expect(output).toContain("Enum PostStatus {");
    expect(output).toContain("draft");
    expect(output).toContain("published");
    expect(output).toContain("archived");
  });

  it("generates enum column", async () => {
    const output = await emitDbmlFile(
      `
enum PostStatus {
  draft,
  published,
}

@table
model Post {
  @key id: uuid;
  status: PostStatus;
}
`,
      "posts.dbml",
    );
    expect(output).toContain("Table posts {");
    expect(output).toContain("status PostStatus");
  });
});
