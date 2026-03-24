import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
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
    expect(schema).toContain("email varchar(255)");
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
    expect(schema).toContain("user_id uuid [not null]");
    expect(schema).toContain("team_id integer [not null]");
    expect(schema).toContain("Ref: user_teams.user_id > users.id");
    expect(schema).toContain("Ref: user_teams.team_id > teams.id");
  });
});
