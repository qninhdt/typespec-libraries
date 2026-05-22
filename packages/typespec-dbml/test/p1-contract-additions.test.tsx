/**
 * P1 contract additions - @schema and @defaultExpression in DBML output.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emit } from "../src/emitter.js";
import { createTestRunner } from "./utils.js";

async function emitSchemaDbml(
  code: string,
  options: Record<string, unknown> = {},
): Promise<string> {
  const runner = await createTestRunner();
  await runner.compile(code);
  const outDir = await mkdtemp(join(tmpdir(), "dbml-p1-"));
  await emit({
    program: runner.program,
    options,
    emitterOutputDir: outDir,
  } as never);
  return readFile(join(outDir, "schema.dbml"), "utf8");
}

describe("P1 contract additions (DBML)", () => {
  describe("@schema", () => {
    it("qualifies the table name with the schema on a model with @schema", async () => {
      const schema = await emitSchemaDbml(`
        @schema("billing")
        @table
        model Invoice {
          @key id: uuid;
          amount: int32 = 0;
        }
      `);
      expect(schema).toContain("Table billing.invoices");
    });

    it("inherits @schema from the containing namespace", async () => {
      const schema = await emitSchemaDbml(`
        @schema("billing")
        namespace Demo.Billing {
          @table
          model Invoice {
            @key id: uuid;
          }
        }
      `);
      expect(schema).toContain("Table billing.invoices");
    });

    it("leaves table name unqualified when no @schema is present", async () => {
      const schema = await emitSchemaDbml(`
        @table
        model Invoice {
          @key id: uuid;
        }
      `);
      expect(schema).toContain("Table invoices");
      expect(schema).not.toContain("Table .invoices");
    });
  });

  describe("@defaultExpression", () => {
    it("renders @defaultExpression as the column default", async () => {
      const schema = await emitSchemaDbml(`
        @table
        model Account {
          @key id: uuid;
          @defaultExpression("gen_random_uuid()")
          publicToken: uuid;
        }
      `);
      expect(schema).toContain("gen_random_uuid()");
    });

    it("wins over a TypeSpec literal default when both are present", async () => {
      const schema = await emitSchemaDbml(`
        @table
        model Account {
          @key id: uuid;
          @defaultExpression("now()")
          startedAt: utcDateTime = utcDateTime.fromISO("2024-01-01T00:00:00Z");
        }
      `);
      expect(schema).toContain("now()");
      expect(schema).not.toContain("2024-01-01");
    });
  });

  describe("Project header in split mode", () => {
    it("emits a Project header per split-by-namespace document", async () => {
      const runner = await createTestRunner();
      await runner.compile(`
        namespace Demo.Accounts {
          @table
          model User {
            @key id: uuid;
          }
        }
      `);
      const outDir = await mkdtemp(join(tmpdir(), "dbml-p1-split-project-"));
      await emit({
        program: runner.program,
        options: { "split-by-namespace": true },
        emitterOutputDir: outDir,
      } as never);
      const file = await readFile(join(outDir, "test/demo/accounts.dbml"), "utf8");
      expect(file).toContain("Project");
      expect(file).toContain("database_type: 'PostgreSQL'");
    });
  });

  describe("TableGroup visual grouping", () => {
    it("emits a TableGroup per namespace in single-file mode", async () => {
      const schema = await emitSchemaDbml(`
        namespace Demo.Accounts {
          @table
          model User {
            @key id: uuid;
          }
        }
        namespace Demo.Audit {
          @table
          model Event {
            @key id: uuid;
          }
        }
      `);
      // Quoted because the namespace contains a dot.
      expect(schema).toMatch(/TableGroup "Test\.Demo\.Accounts" \{[^}]*users[^}]*\}/);
      expect(schema).toMatch(/TableGroup "Test\.Demo\.Audit" \{[^}]*events[^}]*\}/);
    });
  });

  describe("association schema-qualified Table heading", () => {
    it("schema-qualifies and quotes the join-table heading when both ends share @schema", async () => {
      const schema = await emitSchemaDbml(`
        @schema("foo")
        namespace Demo.Collab {
          @table
          model User {
            @key id: uuid;
            @manyToMany("user_teams")
            teams: Team[];
          }

          @table
          model Team {
            @key id: int32;
            @manyToMany("user_teams")
            users: User[];
          }
        }
      `);
      expect(schema).toContain("Table foo.user_teams {");
    });
  });

  describe("PG type coverage", () => {
    it("maps citext through to a citext column", async () => {
      const schema = await emitSchemaDbml(`
        @table
        model User {
          @key id: uuid;
          handle: citext;
        }
      `);
      expect(schema).toContain("handle citext");
    });
  });

  describe("array-of-enum support", () => {
    it("renders an enum array as EnumName[]", async () => {
      const schema = await emitSchemaDbml(`
        enum Tag {
          a: "a",
          b: "b",
        }

        @table
        model Post {
          @key id: uuid;
          tags: Tag[];
        }
      `);
      expect(schema).toContain("tags Tag[]");
    });
  });

  describe("association column type fallback diagnostic", () => {
    it("reports association-column-type-fallback and skips the join table for unmappable key types", async () => {
      const runner = await createTestRunner();
      await runner.compile(`
        @table
        model User {
          @key id: unknown;
          @manyToMany("user_teams")
          teams: Team[];
        }

        @table
        model Team {
          @key id: int32;
          @manyToMany("user_teams")
          users: User[];
        }
      `);
      const outDir = await mkdtemp(join(tmpdir(), "dbml-p1-fallback-"));
      await emit({
        program: runner.program,
        options: {},
        emitterOutputDir: outDir,
      } as never);
      expect(
        runner.program.diagnostics.some(
          (d) =>
            d.code === "@qninhdt/typespec-dbml/association-column-type-fallback" &&
            d.severity === "error",
        ),
      ).toBe(true);
      const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
      expect(schema).not.toContain("Table user_teams");
    });
  });

  describe("@check column-name rewrite", () => {
    it("rewrites property names in the check expression to mapped column names", async () => {
      const schema = await emitSchemaDbml(`
        @table
        model Subscription {
          @key id: uuid;
          @check("c", "monthlyPrice >= 0")
          @map("monthly_price")
          monthlyPrice: int32 = 0;
        }
      `);
      expect(schema).toContain("check c: monthly_price >= 0");
      expect(schema).not.toContain("monthlyPrice >= 0");
    });
  });

  describe("multi-source notes use triple-quoted form", () => {
    it("emits a triple-quoted note when both @doc and @check are present", async () => {
      const schema = await emitSchemaDbml(`
        @table
        model Subscription {
          @key id: uuid;
          @doc("monthly subscription price in minor units")
          @check("c", "monthlyPrice >= 0")
          monthlyPrice: int32 = 0;
        }
      `);
      expect(schema).toMatch(
        /'''monthly subscription price in minor units\ncheck c: monthly_price >= 0'''/,
      );
      expect(schema).not.toContain(" | check c:");
    });
  });

  describe("@ignore field comments are trailing, not mid-table", () => {
    it("emits ignored-field comments after the table block, not between columns", async () => {
      const schema = await emitSchemaDbml(`
        @table
        model User {
          @key id: uuid;
          email: string;
          @ignore
          @doc("computed at request time")
          fullName: string;
        }
      `);
      // The comment must NOT appear inside the column list.
      expect(schema).not.toMatch(/email text[^}]*\/\/[^}]*fullName/);
      // It must appear after the closing `}` of the table.
      expect(schema).toMatch(/}\n\/\/ fullName: computed at request time/);
    });
  });

  describe("composite index name preservation", () => {
    it("renders [name: '...', unique] for @@tableUnique with an explicit name", async () => {
      const schema = await emitSchemaDbml(`
        @table
        model User {
          @key id: uuid;
          email: string;
          tenantId: uuid;
        }
        @@tableUnique(User, #["email", "tenantId"], "uq_user_tenant_email");
      `);
      expect(schema).toContain("(email, tenant_id) [name: 'uq_user_tenant_email', unique]");
    });

    it("renders [name: '...'] for @@tableIndex with an explicit name", async () => {
      const schema = await emitSchemaDbml(`
        @table
        model Post {
          @key id: uuid;
          status: string;
          createdAt: utcDateTime;
        }
        @@tableIndex(Post, #["status", "createdAt"], "idx_post_status_created");
      `);
      expect(schema).toContain("(status, created_at) [name: 'idx_post_status_created']");
    });
  });

  describe("split-mode single-segment namespace", () => {
    it("writes the file at ./<namespace>.dbml without crashing", async () => {
      const runner = await createTestRunner();
      // The shared test wrapper wraps user code in `namespace Test { ... }`,
      // so the inner namespace `Foo` resolves as the single-segment leaf
      // `Test.Foo`. Confirms the `namespacePath.slice(0, -1).join("/") || "."`
      // edge case lands the file under `./test/foo.dbml`.
      await runner.compile(`
        namespace Foo {
          @table
          model Item {
            @key id: uuid;
          }
        }
      `);
      const outDir = await mkdtemp(join(tmpdir(), "dbml-p2-single-seg-"));
      await emit({
        program: runner.program,
        options: { "split-by-namespace": true },
        emitterOutputDir: outDir,
      } as never);
      const file = await readFile(join(outDir, "test/foo.dbml"), "utf8");
      expect(file).toContain("Table items");
    });
  });
});
