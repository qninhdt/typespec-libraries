import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emit } from "../src/emitter.js";
import { createTestRunner, emitGoFile, renderGoOutput } from "./utils.jsx";
import { listAllFiles } from "@qninhdt/typespec-orm/testing";

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

  // ─── Group A: @ignore respected in EntDataFile ────────────────────────────
  describe("@ignore in @data structs", () => {
    it("excludes @ignore'd fields from the generated Go struct", async () => {
      const output = await emitGoFile(
        `
        model UserForm {
          name: string;
          @ignore internalToken: string;
        }
      `,
        "user_form.go",
      );

      expect(output).toContain('json:"name"');
      expect(output).not.toContain("InternalToken");
      expect(output).not.toContain("internal_token");
      expect(output).not.toContain('json:"internalToken"');
    });
  });

  // ─── Group B: strict-by-default in EntDataFile ────────────────────────────
  describe("strict diagnostics in @data structs", () => {
    async function runEmit(code: string) {
      const runner = await createTestRunner();
      await runner.compile(code);
      const outDir = await mkdtemp(join(tmpdir(), "ent-emitter-data-strict-"));
      await emit({
        program: runner.program,
        options: {},
        emitterOutputDir: outDir,
      } as never);
      return runner.program.diagnostics;
    }

    it("reports unsupported-type and aborts the file when a data field has no Go mapping", async () => {
      const code = `
        model BadForm {
          name: string;
          payload: unknown;
        }
      `;

      const diagnostics = await runEmit(code);
      const diags = diagnostics.filter((d) => d.code === "@qninhdt/typespec-ent/unsupported-type");
      expect(diags.length).toBeGreaterThan(0);
      expect(diags.every((d) => d.severity === "error")).toBe(true);

      // The file should be omitted entirely rather than emitting `interface{}`.
      const output = await renderGoOutput(code);
      expect(listAllFiles(output)).not.toContain("/bad_form.go");
    });
  });

  // ─── Group D: native PG enum types ────────────────────────────────────────
  describe("native Postgres ENUM types", () => {
    it("emits a plain Ent enum field (TEXT+CHECK) for enum-typed fields", async () => {
      const output = await emitGoFile(
        `
        enum AccountStatus { Active, Suspended, Closed }

        @table
        model Account {
          @key id: uuid;
          status: AccountStatus;
        }
      `,
        "account.go",
      );

      expect(output).toContain('field.Enum("status").Values("Active", "Suspended", "Closed")');
      // Enum fields emit as a plain Ent enum -> TEXT column with a CHECK
      // constraint. Mapping to a native Postgres ENUM type is intentionally
      // avoided (it needs destructive CREATE TYPE migrations) and would be
      // opt-in via a dedicated decorator if ever required.
      expect(output).not.toContain("SchemaType");
      expect(output).not.toContain("entsql.Annotation{Type:");
    });
  });

  // ─── Group G: @noDefault ──────────────────────────────────────────────────
  describe("@noDefault", () => {
    it("suppresses Default(uuid.New) on @key uuid columns", async () => {
      const output = await emitGoFile(
        `
        @table
        model UserProfile {
          @key
          @noDefault
          userId: uuid;
          displayName?: string;
        }
      `,
        "user_profile.go",
      );

      expect(output).toContain('field.UUID("id", uuid.UUID{})');
      expect(output).toContain('StorageKey("user_id")');
      expect(output).toContain("Immutable()");
      expect(output).not.toContain("Default(uuid.New)");
    });

    it("does not interfere when there is no auto-default to suppress", async () => {
      const output = await emitGoFile(
        `
        @table
        model Account {
          @key id: uuid;
          @noDefault
          tier: string;
        }
      `,
        "account.go",
      );

      // Default(uuid.New) on PK still injected (no @noDefault on @key id).
      expect(output).toContain("Default(uuid.New)");
      expect(output).toContain('field.String("tier")');
    });
  });

  // ─── Group F: @polymorphic check opt-out + idColumn snake_case ───────────
  describe("@polymorphic", () => {
    it("emits CHECK constraint by default", async () => {
      const output = await emitGoFile(
        `
        @table
        model RefreshToken {
          @key id: uuid;
          @polymorphic(#["user", "service_account"], "principalId")
          principalType: string;
          principalId: uuid;
        }
      `,
        "refresh_token.go",
      );

      expect(output).toContain(
        "Checks: map[string]string{\"refresh_tokens_principal_type_polymorphic\": \"principal_type IN ('user', 'service_account')\"}",
      );
    });

    it("suppresses CHECK constraint when check: false", async () => {
      const output = await emitGoFile(
        `
        @table
        model RefreshToken {
          @key id: uuid;
          @polymorphic(#["user", "service_account"], "principalId", false)
          principalType: string;
          principalId: uuid;
        }
      `,
        "refresh_token.go",
      );

      expect(output).not.toContain("Checks:");
      expect(output).not.toContain("polymorphic");
      // Compound index still emitted.
      expect(output).toContain('index.Fields("principal_type", "principal_id")');
    });

    it("snake_cases idColumn before emitting compound index", async () => {
      const output = await emitGoFile(
        `
        @table
        model RefreshToken {
          @key id: uuid;
          @polymorphic(#["user", "service_account"], "principalId")
          principalType: string;
          principalId: uuid;
        }
      `,
        "refresh_token.go",
      );

      expect(output).toContain('index.Fields("principal_type", "principal_id")');
      expect(output).not.toContain("principalId");
    });
  });

  // ─── Group E: @schema flows into atlas.hcl ────────────────────────────────
  describe("@schema flows into atlas.hcl", () => {
    async function runEmitToDir(code: string) {
      const runner = await createTestRunner();
      await runner.compile(code);
      const outDir = await mkdtemp(join(tmpdir(), "ent-emitter-atlas-"));
      await emit({
        program: runner.program,
        options: {},
        emitterOutputDir: outDir,
      } as never);
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      return fs.readFile(path.join(outDir, "atlas.hcl"), "utf8");
    }

    it("lists the custom schema in atlas.hcl when @schema is used", async () => {
      const hcl = await runEmitToDir(`
        @schema("billing")
        @table
        model Invoice {
          @key id: uuid;
        }
      `);

      expect(hcl).toContain('schemas = ["billing"]');
      expect(hcl).toContain("search_path=billing");
    });

    it("defaults to public when no @schema is set", async () => {
      const hcl = await runEmitToDir(`
        @table
        model Account {
          @key id: uuid;
        }
      `);

      expect(hcl).toContain('schemas = ["public"]');
      expect(hcl).toContain("search_path=public");
    });
  });
});
