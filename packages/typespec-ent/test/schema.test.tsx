import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emit } from "../src/emitter.js";
import { emitGoFile, createTestRunner } from "./utils.jsx";

describe("Ent schema generation", () => {
  it("generates fields, annotations, indexes, and defaults", async () => {
    const output = await emitGoFile(
      `
      @table("users")
      model User {
        @key id: uuid;
        @unique @maxLength(320) email: string;
        @index role: string = "player";
        @check("users_credits_non_negative", "credits >= 0")
        credits: int32 = 0;
        @autoCreateTime createdAt: utcDateTime;
      }
    `,
      "user.go",
    );

    expect(output).toContain("package schema");
    expect(output).toContain("type User struct {");
    expect(output).toContain("ent.Schema");
    expect(output).toContain('entsql.Annotation{Table: "users"');
    expect(output).toContain('"users_credits_non_negative": "credits >= 0"');
    expect(output).toContain('field.UUID("id", uuid.UUID{})');
    expect(output).toContain("Default(uuid.New)");
    expect(output).toContain('field.String("email")');
    expect(output).toContain("MaxLen(320)");
    expect(output).toContain("Unique()");
    expect(output).toContain('field.String("role")');
    expect(output).toContain('Default("player")');
    expect(output).toContain('index.Fields("role")');
    expect(output).toContain("Default(time.Now)");
    expect(output).toContain("Immutable()");
  });

  it("generates mixin syntax for table mixins", async () => {
    const output = await emitGoFile(
      `
      @tableMixin
      model Timestamped {
        @autoCreateTime createdAt: utcDateTime;
        @autoUpdateTime updatedAt?: utcDateTime;
      }
    `,
      "timestamped.go",
    );

    expect(output).toContain("mixin.Schema");
    expect(output).toContain("func (Timestamped) Fields() []ent.Field");
    expect(output).toContain('field.Time("created_at")');
    expect(output).toContain("UpdateDefault(time.Now)");
    expect(output).not.toContain("TableName()");
  });

  it("generates Ent edges for explicit relations and many-to-many joins", async () => {
    const user = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @mappedBy("owner")
        posts: Post[];
        @manyToMany("user_badges")
        badges: Badge[];
      }

      @table
      model Post {
        @key id: uuid;
        ownerId: uuid;
        @foreignKey("ownerId")
        @onDelete("CASCADE")
        owner: User;
      }

      @table
      model Badge {
        @key id: uuid;
        @manyToMany("user_badges")
        users: User[];
      }
    `,
      "user.go",
    );
    const post = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @mappedBy("owner")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        ownerId: uuid;
        @foreignKey("ownerId")
        @onDelete("CASCADE")
        owner: User;
      }
    `,
      "post.go",
    );

    expect(user).toContain('edge.To("posts", Post.Type)');
    expect(user).toContain('StorageKey(edge.Column("owner_id"))');
    // Badge < User alphabetically, so Badge owns the join table; the User
    // side becomes the inverse and emits edge.From(...).Ref("users").
    expect(user).toContain('edge.From("badges", Badge.Type)');
    expect(user).toContain('Ref("users")');
    expect(post).toContain('edge.From("owner", User.Type)');
    expect(post).toContain('Ref("posts")');
    expect(post).toContain('Field("owner_id")');
    expect(post).toContain("Required()");
    expect(post).toContain("Annotations(entsql.OnDelete(entsql.Cascade))");
  });

  it("emits @onDelete annotation; @onUpdate is recorded but not surfaced (entsql lacks OnUpdate)", async () => {
    const post = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @mappedBy("owner")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        ownerId: uuid;
        @foreignKey("ownerId")
        @onDelete("CASCADE")
        @onUpdate("CASCADE")
        owner: User;
      }
    `,
      "post.go",
    );

    expect(post).toContain("entsql.OnDelete(entsql.Cascade)");
    expect(post).not.toContain("entsql.OnUpdate(");
  });

  it("emits no entsql annotation when only @onUpdate is set (Ent SDK has no OnUpdate)", async () => {
    const post = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @mappedBy("owner")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        ownerId: uuid;
        @foreignKey("ownerId")
        @onUpdate("SET NULL")
        owner?: User;
      }
    `,
      "post.go",
    );

    expect(post).not.toContain("entsql.OnUpdate(");
    expect(post).not.toContain("entsql.OnDelete(");
  });

  it("surfaces @onUpdate as a Comment marker when on-update-emit-raw-sql is enabled", async () => {
    const post = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @mappedBy("owner")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        ownerId: uuid;
        @foreignKey("ownerId")
        @onDelete("CASCADE")
        @onUpdate("CASCADE")
        owner: User;
      }
    `,
      "post.go",
      "test",
      { "on-update-emit-raw-sql": true },
    );

    expect(post).toContain('Comment("on_update: CASCADE")');
    expect(post).toContain("entsql.OnDelete(entsql.Cascade)");
  });

  it("does not emit a column for @ignore'd properties", async () => {
    const output = await emitGoFile(
      `
      @table("users")
      model User {
        @key id: uuid;
        email: string;
        @ignore secrets: Record<unknown>;
      }
    `,
      "user.go",
    );

    expect(output).toContain('field.UUID("id"');
    expect(output).toContain('field.String("email")');
    expect(output).not.toContain("secrets");
    expect(output).not.toContain('field.JSON("secrets"');
  });

  it("emits asymmetric many-to-many edges (To on owner, From on inverse)", async () => {
    const a = await emitGoFile(
      `
      @table
      model AModel {
        @key id: uuid;
        @manyToMany("a_b_join")
        bs: BModel[];
      }
      @table
      model BModel {
        @key id: uuid;
        @manyToMany("a_b_join")
        as: AModel[];
      }
    `,
      "a_model.go",
    );
    const b = await emitGoFile(
      `
      @table
      model AModel {
        @key id: uuid;
        @manyToMany("a_b_join")
        bs: BModel[];
      }
      @table
      model BModel {
        @key id: uuid;
        @manyToMany("a_b_join")
        as: AModel[];
      }
    `,
      "b_model.go",
    );

    // AModel < BModel, so AModel owns the relation
    expect(a).toContain('edge.To("bs", BModel.Type)');
    expect(a).toContain('StorageKey(edge.Table("a_b_join")');
    expect(a).toContain("edge.Columns(");
    expect(a).not.toContain('edge.From("bs"');

    // BModel is the inverse side
    expect(b).toContain('edge.From("as", AModel.Type)');
    expect(b).toContain('Ref("bs")');
    expect(b).not.toContain('edge.To("as"');
    expect(b).not.toContain("StorageKey(edge.Table(");
  });

  it("@manyToManyOwner overrides alphabetic ownership", async () => {
    const a = await emitGoFile(
      `
      @table
      model AModel {
        @key id: uuid;
        @manyToMany("a_b_join")
        bs: BModel[];
      }
      @table
      model BModel {
        @key id: uuid;
        @manyToMany("a_b_join")
        @manyToManyOwner
        as: AModel[];
      }
    `,
      "a_model.go",
    );
    const b = await emitGoFile(
      `
      @table
      model AModel {
        @key id: uuid;
        @manyToMany("a_b_join")
        bs: BModel[];
      }
      @table
      model BModel {
        @key id: uuid;
        @manyToMany("a_b_join")
        @manyToManyOwner
        as: AModel[];
      }
    `,
      "b_model.go",
    );

    // BModel carries @manyToManyOwner so it owns regardless of alphabetic order
    expect(b).toContain('edge.To("as", AModel.Type)');
    expect(b).toContain('StorageKey(edge.Table("a_b_join")');
    expect(a).toContain('edge.From("bs", BModel.Type)');
    expect(a).toContain('Ref("as")');
  });

  it("forces timestamptz schema type for utcDateTime fields", async () => {
    const output = await emitGoFile(
      `
      @table
      model Event {
        @key id: uuid;
        occurredAt: utcDateTime;
      }
    `,
      "event.go",
    );

    expect(output).toContain('field.Time("occurred_at")');
    expect(output).toContain('SchemaType(map[string]string{dialect.Postgres: "timestamptz"})');
  });

  it("forces timestamptz for offsetDateTime fields (offset preserved by connection TZ)", async () => {
    const output = await emitGoFile(
      `
      @table
      model Event {
        @key id: uuid;
        occurredAt: offsetDateTime;
      }
    `,
      "event.go",
    );

    expect(output).toContain('field.Time("occurred_at")');
    expect(output).toContain('SchemaType(map[string]string{dialect.Postgres: "timestamptz"})');
  });

  it("emits date and time SchemaType overrides for plainDate / plainTime", async () => {
    const output = await emitGoFile(
      `
      @table
      model Reservation {
        @key id: uuid;
        day: plainDate;
        slot: plainTime;
      }
    `,
      "reservation.go",
    );

    expect(output).toContain('field.Time("day")');
    expect(output).toContain('SchemaType(map[string]string{dialect.Postgres: "date"})');
    expect(output).toContain('field.Time("slot")');
    expect(output).toContain('SchemaType(map[string]string{dialect.Postgres: "time"})');
  });

  it("surfaces @version as a SchemaType-free annotation", async () => {
    const output = await emitGoFile(
      `
      @table
      model Article {
        @key id: uuid;
        @version version: int32 = 0;
      }
    `,
      "article.go",
    );

    expect(output).toContain('entsql.Annotation{Table: "articles"}');
  });

  it("emits a generic numeric SchemaType for decimal fields without @precision", async () => {
    const output = await emitGoFile(
      `
      @table
      model Ledger {
        @key id: uuid;
        balance: decimal;
      }
    `,
      "ledger.go",
    );

    expect(output).toContain("field.Other(");
    expect(output).toContain("decimal.Decimal{}");
    expect(output).toContain('SchemaType(map[string]string{dialect.Postgres: "numeric"})');
  });

  it("preserves precision when @precision is set on a decimal", async () => {
    const output = await emitGoFile(
      `
      @table
      model Ledger {
        @key id: uuid;
        @precision(18, 4)
        balance: decimal;
      }
    `,
      "ledger.go",
    );

    expect(output).toContain('SchemaType(map[string]string{dialect.Postgres: "numeric(18,4)"})');
  });

  it("surfaces field-level @scope as a Comment line on the field", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @Qninhdt.Orm.scope("frontend")
        @Qninhdt.Orm.scope("kafka:upload-events")
        avatarUrl: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain('field.String("avatar_url")');
    expect(output).toMatch(
      /Comment\("scope: (frontend, kafka:upload-events|kafka:upload-events, frontend)"\)/,
    );
  });

  it("merges field-level @doc and @scope into a single Comment", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @doc("Human-readable display name.")
        @Qninhdt.Orm.scope("frontend")
        displayName: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain("Human-readable display name.");
    expect(output).toContain("scope: frontend");
  });

  it("locks down composite @@tableIndex rendering through index.Fields(...)", async () => {
    const output = await emitGoFile(
      `
      @table
      model Membership {
        @key id: uuid;
        userId: uuid;
        teamId: uuid;
      }
      @@tableIndex(Membership, #["userId", "teamId"], "idx_membership_user_team");
    `,
      "membership.go",
    );

    expect(output).toContain('index.Fields("user_id", "team_id")');
  });
});

describe("Ent diagnostics", () => {
  async function runEmit(code: string) {
    const runner = await createTestRunner();
    await runner.compile(code);
    const outDir = await mkdtemp(join(tmpdir(), "ent-emitter-diag-"));
    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);
    return runner.program.diagnostics;
  }

  it("reports an error (not a warning) when a property has no Go type mapping", async () => {
    const diagnostics = await runEmit(`
      @table
      model Broken {
        @key id: uuid;
        payload: unknown;
      }
    `);
    const diags = diagnostics.filter((d) => d.code === "@qninhdt/typespec-ent/unsupported-type");
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.every((d) => d.severity === "error")).toBe(true);
  });

  it("reports cross-package-edge when an edge target lives in a different namespace", async () => {
    const diagnostics = await runEmit(`
      namespace App.Billing {
        @table
        model Invoice {
          @key id: uuid;
          customerId: uuid;
          @foreignKey("customerId")
          customer: App.Identity.Customer;
        }
      }
      namespace App.Identity {
        @table
        model Customer {
          @key id: uuid;
        }
      }
    `);
    expect(
      diagnostics.some(
        (d) => d.code === "@qninhdt/typespec-ent/cross-package-edge" && d.severity === "error",
      ),
    ).toBe(true);
  });

  it("reports referenced-column-fk-not-supported-by-ent when @foreignKey targets a non-key column", async () => {
    const diagnostics = await runEmit(`
      @table
      model Org {
        @key id: uuid;
        @unique slug: string;
      }
      @table
      model Member {
        @key id: uuid;
        orgSlug: string;
        @foreignKey("orgSlug", "slug")
        org: Org;
      }
    `);
    expect(
      diagnostics.some(
        (d) =>
          d.code === "@qninhdt/typespec-ent/referenced-column-fk-not-supported-by-ent" &&
          d.severity === "error",
      ),
    ).toBe(true);
  });
});

describe("Ent partial indexes", () => {
  it("emits entsql.IndexWhere for a field-level @index + @partialIndex", async () => {
    const output = await emitGoFile(
      `
      @table
      model Outbox {
        @key id: bigserial;
        @index
        @partialIndex("published_at IS NULL")
        @autoCreateTime
        createdAt: utcDateTime;
      }
    `,
      "outbox.go",
    );

    expect(output).toContain('index.Fields("created_at")');
    expect(output).toContain('Annotations(entsql.IndexWhere("published_at IS NULL"))');
  });

  it("combines @indexUsing(gin) and @partialIndex into a single Annotations(...) call", async () => {
    const output = await emitGoFile(
      `
      @table
      model File {
        @key id: uuid;
        @index
        @indexUsing("gin")
        @partialIndex("deleted_at IS NULL AND status = 'ready'")
        searchVector: jsonb;
      }
    `,
      "file.go",
    );

    expect(output).toContain('index.Fields("search_vector")');
    expect(output).toContain('entsql.IndexType("GIN")');
    expect(output).toContain("entsql.IndexWhere(\"deleted_at IS NULL AND status = 'ready'\")");
  });

  it("emits entsql.IndexWhere on a composite @@tableIndex with `where`", async () => {
    const output = await emitGoFile(
      `
      @table
      model Folder {
        @key id: uuid;
        workspaceId: uuid;
        parentId?: uuid;
        name: string;
      }
      @@tableIndex(
        Folder,
        #["workspaceId", "parentId", "name"],
        "folders_unique_name_per_parent",
        "deleted_at IS NULL AND parent_id IS NOT NULL"
      );
    `,
      "folder.go",
    );

    expect(output).toContain('index.Fields("workspace_id", "parent_id", "name")');
    expect(output).toContain(
      'Annotations(entsql.IndexWhere("deleted_at IS NULL AND parent_id IS NOT NULL"))',
    );
  });

  it("emits Unique() and IndexWhere on a partial @@tableUnique", async () => {
    const output = await emitGoFile(
      `
      @table
      model SigningKey {
        @key id: uuid;
        status: string;
      }
      @@tableUnique(
        SigningKey,
        #["status"],
        "signing_keys_one_active",
        "status = 'active'"
      );
    `,
      "signing_key.go",
    );

    expect(output).toContain('index.Fields("status")');
    expect(output).toContain("Unique()");
    expect(output).toContain("entsql.IndexWhere(\"status = 'active'\")");
  });
});
