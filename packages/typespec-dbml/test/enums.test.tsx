/**
 * Enum tests.
 */

import { describe, expect, it } from "vitest";
import { emitDbmlFile, createTestRunner, renderDbmlOutput } from "./utils.js";
import { collectTableModels } from "@qninhdt/typespec-orm";
import { generateColumnLine } from "../src/components/DbmlColumn.js";

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

  it("emits canonical enum member name when default maps via the enum value", async () => {
    const output = await emitDbmlFile(
      `
enum AccountStatus {
  active: "active",
  pendingVerification: "pending_verification",
}

@table
model Account {
  @key id: uuid;
  status: AccountStatus = AccountStatus.pendingVerification;
}
`,
      "accounts.dbml",
    );
    // Should reference the canonical member name "pendingVerification",
    // not the unnormalized string value "pending_verification".
    expect(output).toContain("status AccountStatus [not null, default: 'pendingVerification']");
    expect(output).not.toContain("'pending_verification'");
  });

  it("emits not null on non-optional enum columns", async () => {
    const output = await emitDbmlFile(
      `
enum Color { red, green, blue }

@table
model Thing {
  @key id: uuid;
  shade: Color;
}
`,
      "things.dbml",
    );
    expect(output).toContain("shade Color [not null]");
  });

  it("reports a diagnostic when an enum default does not match any member", async () => {
    // Bypass the test runner's no-error guard by driving the column emitter directly.
    const runner = await createTestRunner();
    await runner.compile(`
      enum FileCategory {
        unspecified: "unknown",
        document: "document",
      }

      @table
      model FileMetadata {
        @key id: uuid;
        category: FileCategory;
      }
    `);
    const program = runner.program;

    // Simulate an upstream defaulting bug: a column whose default doesn't
    // appear in the enum's name OR value set.
    const tables = collectTableModels(program);
    const meta = tables.find((t) => t.tableName === "file_metadatas") ?? tables[0];
    const categoryProp = meta.model.properties.get("category")!;
    // Patch the property's default to a bogus literal value.
    (categoryProp as unknown as { defaultValue: unknown }).defaultValue = {
      valueKind: "StringValue",
      value: "bogus_member",
    };

    generateColumnLine(program, categoryProp);

    const found = program.diagnostics.some(
      (d) => d.code === "@qninhdt/typespec-dbml/invalid-enum-default",
    );
    expect(found).toBe(true);
  });

  it("does not report a diagnostic when the default is a real member name", async () => {
    const output = await renderDbmlOutput(`
      enum Color { red, green, blue }

      @table
      model Thing {
        @key id: uuid;
        shade: Color = Color.green;
      }
    `);
    // No assertion failures means renderDbmlOutput's error filter passed.
    expect(output).toBeDefined();
  });
});
