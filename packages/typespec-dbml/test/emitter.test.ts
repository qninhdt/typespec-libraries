import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { Parser } from "@dbml/core";
import { emit } from "../src/emitter.js";
import { createTestRunner } from "./utils.js";

describe("DBML emitter entrypoint", () => {
  it("emits a single schema document", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Accounts {
        @table
        model User {
          @key id: uuid;
          email: string;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    expect(schema).toContain("Table users");
    expect(schema).toContain("email text");
  });

  it("reports unsupported column types as errors", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Broken {
        @key id: uuid;
        payload: unknown;
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-unsupported-"));

    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) =>
          diag.code === "@qninhdt/typespec-dbml/unsupported-type" && diag.severity === "error",
      ),
    ).toBe(true);
  });

  it("emits namespace-split documents when requested", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Accounts {
        @table
        model User {
          @key id: uuid;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-split-"));
    await emit({
      program: runner.program,
      options: { "split-by-namespace": true },
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "test/demo/accounts.dbml"), "utf8");
    expect(schema).toContain("// Namespace: Test.Demo.Accounts");
    expect(schema).toContain("Table users");
  });

  it("schema-qualifies cross-schema FK refs in split mode", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @schema("auth")
      namespace Demo.Accounts {
        @table
        model User {
          @key id: uuid;
        }
      }

      @schema("blog")
      namespace Demo.Posts {
        @table
        model Post {
          @key id: uuid;
          authorId: uuid;
          @foreignKey("author_id")
          author: Demo.Accounts.User;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-cross-schema-"));
    await emit({
      program: runner.program,
      options: { "split-by-namespace": true },
      emitterOutputDir: outDir,
    } as never);

    const postsSchema = await readFile(join(outDir, "test/demo/posts.dbml"), "utf8");
    // The Ref must qualify both endpoints with their respective schemas.
    expect(postsSchema).toContain("Ref: blog.posts.author_id > auth.users.id");
  });

  it("carries cross-namespace enum into every file that references it", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Shared {
        enum RoleKind {
          admin: "admin",
          member: "member",
        }
      }

      namespace Demo.Accounts {
        @table
        model User {
          @key id: uuid;
          role: Demo.Shared.RoleKind;
        }
      }

      namespace Demo.Audit {
        @table
        model Event {
          @key id: uuid;
          actorRole: Demo.Shared.RoleKind;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-cross-ns-enum-"));
    await emit({
      program: runner.program,
      options: { "split-by-namespace": true },
      emitterOutputDir: outDir,
    } as never);

    const accountsFile = await readFile(join(outDir, "test/demo/accounts.dbml"), "utf8");
    const auditFile = await readFile(join(outDir, "test/demo/audit.dbml"), "utf8");
    // Every file that references the enum must declare it locally; otherwise the
    // resulting DBML has a dangling enum reference.
    expect(accountsFile).toContain("Enum RoleKind");
    expect(accountsFile).toContain("role RoleKind");
    expect(auditFile).toContain("Enum RoleKind");
    expect(auditFile).toContain("actor_role RoleKind");
  });

  it("emits a Project header in single-file mode", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Accounts {
        @table
        model User {
          @key id: uuid;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-project-"));
    await emit({
      program: runner.program,
      options: { "project-name": "demo_app" },
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    expect(schema).toContain("Project demo_app {");
    expect(schema).toContain("database_type: 'PostgreSQL'");
  });

  it("emits @doc on a table as a DBML Note", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @doc("All registered users of the platform.")
      @table
      model User {
        @key id: uuid;
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-table-note-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    expect(schema).toContain("Note: 'All registered users of the platform.'");
  });

  it("emits enums, many-to-many tables, and refs in a combined schema", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Collab {
        enum RoleKind {
          admin: "admin",
          member: "member",
        }

        @table
        model User {
          @key id: uuid;
          role: RoleKind;
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

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-association-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    expect(schema).toContain("Enum RoleKind");
    expect(schema).toContain("Table user_teams");
    // Per-column composite-PK on association tables — both columns carry [pk]
    // alongside the composite-PK index entry so tooling that walks
    // Table.fields[].pk recognizes the key.
    expect(schema).toContain("user_id uuid [pk, not null]");
    expect(schema).toContain("team_id integer [pk, not null]");
    expect(schema).toContain("Ref: user_teams.user_id > users.id");
    expect(schema).toContain("Ref: user_teams.team_id > teams.id");
  });

  it("hoists shared enums once in single-file mode across namespaces", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Shared {
        enum RoleKind {
          admin: "admin",
          member: "member",
        }
      }

      namespace Demo.Accounts {
        @table
        model User {
          @key id: uuid;
          role: Demo.Shared.RoleKind;
        }
      }

      namespace Demo.Audit {
        @table
        model Event {
          @key id: uuid;
          actorRole: Demo.Shared.RoleKind;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-hoist-enum-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    // Shared enum must appear exactly once even though two namespaces reference it.
    const enumOccurrences = schema.match(/Enum RoleKind \{/g) ?? [];
    expect(enumOccurrences).toHaveLength(1);
  });

  it("quotes ref endpoints when columns contain hyphens via @map", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key
        @map("user-id")
        id: uuid;
      }

      @table
      model Post {
        @key id: uuid;
        @map("author-id")
        authorId: uuid;
        @foreignKey("author-id")
        author: User;
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-hyphen-ref-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    // Both ref endpoints with non-bare identifiers must be quoted.
    expect(schema).toContain('Ref: posts."author-id" > users."user-id"');
  });

  it("quotes reserved DBML keywords used as column names", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Doc {
        @key id: uuid;
        @map("Note")
        note: string;
        @map("Table")
        tableName: string;
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-reserved-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    expect(schema).toContain('"Note" text');
    expect(schema).toContain('"Table" text');
  });

  it("produces output that @dbml/core can parse without errors", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.App {
        enum Status {
          active: "active",
          inactive: "inactive",
        }

        @table
        model User {
          @key id: uuid;
          email: string;
          status: Status;
          @manyToMany("user_teams")
          teams: Team[];
        }

        @table
        model Team {
          @key id: int32;
          @manyToMany("user_teams")
          users: User[];
        }

        @table
        model Post {
          @key id: uuid;
          @foreignKey("author_id")
          author: User;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-roundtrip-"));
    await emit({
      program: runner.program,
      options: { "project-name": "demo_app" },
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    // @dbml/core's Parser throws on syntax errors. A clean parse asserts the
    // emitted document is structurally valid DBML.
    expect(() => Parser.parse(schema, "dbml")).not.toThrow();
  });

  describe("@dbml/core round-trip parse over every emitter fixture", () => {
    // Every fixture exercised by the rest of this file is replayed here so a
    // syntactic regression in any helper (column quoting, ref formatting,
    // join-table layout, project headers, etc.) trips a parse failure rather
    // than silently producing DBML the downstream tooling cannot ingest.
    const fixtures: ReadonlyArray<{
      name: string;
      tsp: string;
      options?: Record<string, unknown>;
    }> = [
      {
        name: "single-namespace",
        tsp: `
          namespace Demo.Accounts {
            @table
            model User {
              @key id: uuid;
              email: string;
            }
          }
        `,
      },
      {
        name: "split-namespace",
        tsp: `
          namespace Demo.Accounts {
            @table
            model User {
              @key id: uuid;
            }
          }
        `,
        options: { "split-by-namespace": true },
      },
      {
        name: "cross-schema-fk",
        // NOTE: We deliberately keep this fixture in single-file mode here:
        // split-mode cross-schema files reference tables defined in OTHER
        // files (one Ref per file), and @dbml/core's Parser is per-file, so
        // it would (correctly) report an unresolved table. The cross-schema
        // FK qualification itself is asserted by the dedicated split-mode
        // test above.
        tsp: `
          @schema("auth")
          namespace Demo.Accounts {
            @table
            model User {
              @key id: uuid;
            }
          }

          @schema("blog")
          namespace Demo.Posts {
            @table
            model Post {
              @key id: uuid;
              authorId: uuid;
              @foreignKey("author_id")
              author: Demo.Accounts.User;
            }
          }
        `,
      },
      {
        name: "cross-namespace-enum",
        tsp: `
          namespace Demo.Shared {
            enum RoleKind {
              admin: "admin",
              member: "member",
            }
          }

          namespace Demo.Accounts {
            @table
            model User {
              @key id: uuid;
              role: Demo.Shared.RoleKind;
            }
          }

          namespace Demo.Audit {
            @table
            model Event {
              @key id: uuid;
              actorRole: Demo.Shared.RoleKind;
            }
          }
        `,
        options: { "split-by-namespace": true },
      },
      {
        name: "single-with-project-name",
        tsp: `
          namespace Demo.Accounts {
            @table
            model User {
              @key id: uuid;
            }
          }
        `,
        options: { "project-name": "demo_app" },
      },
      {
        name: "table-with-doc-note",
        tsp: `
          @doc("All registered users of the platform.")
          @table
          model User {
            @key id: uuid;
          }
        `,
      },
      {
        name: "enum-and-many-to-many",
        tsp: `
          namespace Demo.Collab {
            enum RoleKind {
              admin: "admin",
              member: "member",
            }

            @table
            model User {
              @key id: uuid;
              role: RoleKind;
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
        `,
      },
      {
        name: "hyphenated-map-fk",
        tsp: `
          @table
          model User {
            @key
            @map("user-id")
            id: uuid;
          }

          @table
          model Post {
            @key id: uuid;
            @map("author-id")
            authorId: uuid;
            @foreignKey("author-id")
            author: User;
          }
        `,
      },
      {
        name: "reserved-keyword-columns",
        tsp: `
          @table
          model Doc {
            @key id: uuid;
            @map("Note")
            note: string;
            @map("Table")
            tableName: string;
          }
        `,
      },
    ];

    for (const fixture of fixtures) {
      it(`fixture ${fixture.name} parses cleanly`, async () => {
        const runner = await createTestRunner();
        await runner.compile(fixture.tsp);

        const outDir = await mkdtemp(join(tmpdir(), `dbml-roundtrip-${fixture.name}-`));
        await emit({
          program: runner.program,
          options: fixture.options ?? {},
          emitterOutputDir: outDir,
        } as never);

        const dbmlFiles = await collectDbmlFiles(outDir);
        expect(dbmlFiles.length).toBeGreaterThan(0);
        for (const filePath of dbmlFiles) {
          const content = await readFile(filePath, "utf8");
          expect(
            () => Parser.parse(content, "dbml"),
            `Parser failed for ${fixture.name} :: ${filePath}`,
          ).not.toThrow();
        }
      });
    }
  });

  it("quotes Postgres reserved words used as a table name", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table("user")
      model Account {
        @key id: uuid;
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-pg-reserved-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    expect(schema).toContain('Table "user"');
    expect(schema).not.toMatch(/^Table user\b/m);
  });

  it("warns and falls back to jsonb when the array element type is unmappable", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      model Inner {
        nested: string;
      }

      @table
      model Bag {
        @key id: uuid;
        items: Inner[];
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-array-fallback-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) =>
          diag.code === "@qninhdt/typespec-dbml/unsupported-array-element" &&
          diag.severity === "warning",
      ),
    ).toBe(true);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    expect(schema).toContain("items jsonb");
  });

  it("preserves quoted string literals when rewriting @check identifiers", async () => {
    const runner = await createTestRunner();
    // The literal `'%name%'` contains the substring `name`, which is also a
    // sibling property. Naive token substitution would rewrite it to the
    // mapped column name and corrupt the literal; the tokenizer must skip
    // anything inside single-quoted SQL literals. The trailing `length(...)`
    // is here so the literal isn't the final character of the @check note —
    // formatDbmlNote escapes a trailing apostrophe to keep the closing
    // `'''` triple delimiter unambiguous, which would otherwise mask the
    // identifier-substitution behavior we want to assert here.
    await runner.compile(`
      @table
      model Doc {
        @key id: uuid;
        @check("c", "name LIKE '%name%' AND length(name) > 0")
        @map("doc_name")
        name: string;
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "dbml-emitter-check-literal-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const schema = await readFile(join(outDir, "schema.dbml"), "utf8");
    // Identifiers outside the literal ARE rewritten; literal content is not.
    expect(schema).toContain("doc_name LIKE '%name%' AND length(doc_name) > 0");
    expect(schema).not.toContain("'%doc_name%'");
  });
});

async function collectDbmlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectDbmlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".dbml")) {
      out.push(full);
    }
  }
  return out;
}
