import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("P1 contract additions", () => {
  describe("@schema", () => {
    it("emits __table_args__ schema dict on a model with @schema", async () => {
      const output = await emitPyFile(
        `
        @schema("billing")
        @table
        model Invoice {
          @key id: uuid;
          amount: int32 = 0;
        }
      `,
        "invoice.py",
      );

      expect(output).toContain('{"schema": "billing"}');
    });

    it("inherits schema from the containing namespace", async () => {
      const output = await emitPyFile(
        `
        @schema("billing")
        namespace Demo.Billing {
          @table
          model Invoice {
            @key id: uuid;
          }
        }
      `,
        "invoice.py",
      );

      expect(output).toContain('{"schema": "billing"}');
    });
  });

  describe("@defaultExpression", () => {
    it("renders @defaultExpression as text(...) wrapped server_default", async () => {
      const output = await emitPyFile(
        `
        @table
        model Account {
          @key id: uuid;
          @defaultExpression("gen_random_uuid()")
          publicToken: uuid;
        }
      `,
        "account.py",
      );

      expect(output).toContain('text("gen_random_uuid()")');
    });

    it("wins over a TypeSpec literal default when both are present", async () => {
      const output = await emitPyFile(
        `
        @table
        model Account {
          @key id: uuid;
          @defaultExpression("now()")
          startedAt: utcDateTime = utcDateTime.fromISO("2024-01-01T00:00:00Z");
        }
      `,
        "account.py",
      );

      expect(output).toContain('text("now()")');
      expect(output).not.toContain("2024-01-01");
    });
  });

  describe("@version", () => {
    it("emits __mapper_args__ with version_id_col on a model with @version", async () => {
      const output = await emitPyFile(
        `
        @table
        model Account {
          @key id: uuid;
          @version
          revision: int32 = 0;
        }
      `,
        "account.py",
      );

      expect(output).toContain('__mapper_args__ = {"version_id_col": "revision"}');
    });

    it("respects @map when picking the version column name", async () => {
      const output = await emitPyFile(
        `
        @table
        model Account {
          @key id: uuid;
          @version @map("row_version")
          revision: int32 = 0;
        }
      `,
        "account.py",
      );

      expect(output).toContain('__mapper_args__ = {"version_id_col": "row_version"}');
    });
  });

  describe("@@tableIndex / @@tableUnique", () => {
    it("emits a multi-column index from @@tableIndex augment", async () => {
      const output = await emitPyFile(
        `
        @table
        model User {
          @key id: uuid;
          firstName: string;
          lastName: string;
        }
        @@tableIndex(User, #["firstName", "lastName"]);
      `,
        "user.py",
      );

      expect(output).toContain('Index(');
      expect(output).toContain('"first_name", "last_name"');
    });

    it("emits a multi-column unique constraint from @@tableUnique augment", async () => {
      const output = await emitPyFile(
        `
        @table
        model ApiToken {
          @key id: uuid;
          tenantId: uuid;
          fingerprint: string;
        }
        @@tableUnique(ApiToken, #["tenantId", "fingerprint"]);
      `,
        "api_token.py",
      );

      expect(output).toContain("UniqueConstraint(");
      expect(output).toContain('"tenant_id", "fingerprint"');
    });
  });
});
