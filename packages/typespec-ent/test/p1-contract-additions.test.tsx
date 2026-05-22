import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("P1 contract additions (Ent)", () => {
  describe("@schema", () => {
    it("emits Schema field in entsql.Annotation when @schema is set on the model", async () => {
      const output = await emitGoFile(
        `
        @schema("billing")
        @table
        model Invoice {
          @key id: uuid;
          amount: int32 = 0;
        }
      `,
        "invoice.go",
      );

      expect(output).toContain('entsql.Annotation{Table: "invoices"');
      expect(output).toContain('Schema: "billing"');
    });

    it("inherits @schema from the containing namespace", async () => {
      const output = await emitGoFile(
        `
        @schema("billing")
        namespace Demo.Billing {
          @table
          model Invoice {
            @key id: uuid;
          }
        }
      `,
        "invoice.go",
      );

      expect(output).toContain('Schema: "billing"');
    });
  });

  describe("@defaultExpression", () => {
    it("emits Annotations(entsql.Default(...)) chain when @defaultExpression is set", async () => {
      const output = await emitGoFile(
        `
        @table
        model Account {
          @key id: uuid;
          @defaultExpression("gen_random_uuid()")
          publicToken: uuid;
        }
      `,
        "account.go",
      );

      expect(output).toContain('Annotations(entsql.Default("gen_random_uuid()"))');
    });

    it("wins over a TypeSpec literal default when both are present", async () => {
      const output = await emitGoFile(
        `
        @table
        model Account {
          @key id: uuid;
          @defaultExpression("now()")
          startedAt: utcDateTime = utcDateTime.fromISO("2024-01-01T00:00:00Z");
        }
      `,
        "account.go",
      );

      expect(output).toContain('entsql.Default("now()")');
      expect(output).not.toContain("2024-01-01");
    });
  });
});
