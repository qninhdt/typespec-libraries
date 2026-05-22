/**
 * P1 contract additions - @schema and @defaultExpression in DBML output.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emit } from "../src/emitter.js";
import { createTestRunner } from "./utils.js";

async function emitSchemaDbml(code: string): Promise<string> {
  const runner = await createTestRunner();
  await runner.compile(code);
  const outDir = await mkdtemp(join(tmpdir(), "dbml-p1-"));
  await emit({
    program: runner.program,
    options: {},
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
});
