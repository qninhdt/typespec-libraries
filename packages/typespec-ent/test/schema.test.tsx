import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

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
});
