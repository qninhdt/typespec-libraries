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
    expect(user).toContain('edge.To("badges", Badge.Type)');
    expect(user).toContain('StorageKey(edge.Table("user_badges"))');
    expect(post).toContain('edge.From("owner", User.Type)');
    expect(post).toContain('Ref("posts")');
    expect(post).toContain('Field("owner_id")');
    expect(post).toContain("Required()");
    expect(post).toContain("Annotations(entsql.OnDelete(entsql.Cascade))");
  });
});
