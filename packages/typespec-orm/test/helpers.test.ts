import { describe, expect, it } from "vitest";
import type { Model } from "@typespec/compiler";
import {
  camelToSnake,
  camelToPascal,
  collectDataModels,
  collectManyToManyAssociations,
  collectTableModels,
  collectTableMixins,
  deriveManyToManyJoinColumnName,
  deriveTableName,
  getDoc,
  getInputTypeForProperty,
  getPropertyEnum,
  getTypeFullName,
  resolveDbType,
  resolveRelation,
} from "../src/helpers.js";
import { createTestRunner } from "./utils.js";

describe("camelToSnake", () => {
  it("converts simple camelCase", () => {
    expect(camelToSnake("userId")).toBe("user_id");
  });

  it("converts PascalCase", () => {
    expect(camelToSnake("StoryNode")).toBe("story_node");
  });

  it("handles consecutive uppercase letters", () => {
    expect(camelToSnake("HTMLParser")).toBe("html_parser");
  });

  it("handles single word lowercase", () => {
    expect(camelToSnake("name")).toBe("name");
  });

  it("handles single letter words", () => {
    expect(camelToSnake("x")).toBe("x");
  });

  it("handles already snake_case", () => {
    expect(camelToSnake("user_id")).toBe("user_id");
  });
});

describe("camelToPascal", () => {
  it("converts camelCase to PascalCase", () => {
    // The function treats 'Id' as an acronym -> 'UserID'
    expect(camelToPascal("userId")).toBe("UserID");
  });

  it("keeps PascalCase with acronym", () => {
    expect(camelToPascal("UserId")).toBe("UserID");
  });

  it("handles single char", () => {
    expect(camelToPascal("a")).toBe("A");
  });

  it("converts simple camelCase", () => {
    expect(camelToPascal("userName")).toBe("UserName");
  });
});

describe("deriveTableName", () => {
  it("pluralizes simple name", () => {
    expect(deriveTableName("User")).toBe("users");
  });

  it("pluralizes PascalCase name", () => {
    expect(deriveTableName("StoryNode")).toBe("story_nodes");
  });

  it("pluralizes -y with consonant before it to -ies", () => {
    expect(deriveTableName("Category")).toBe("categories");
  });

  it("pluralizes -y with vowel before it by adding -s", () => {
    expect(deriveTableName("Day")).toBe("days");
  });

  it("pluralizes -s ending by adding -es", () => {
    expect(deriveTableName("Address")).toBe("addresses");
  });

  it("pluralizes -x ending by adding -es", () => {
    expect(deriveTableName("Box")).toBe("boxes");
  });

  it("pluralizes -sh ending by adding -es", () => {
    expect(deriveTableName("Wish")).toBe("wishes");
  });

  it("pluralizes -ch ending by adding -es", () => {
    expect(deriveTableName("Match")).toBe("matches");
  });
});

describe("metadata and relation helpers", () => {
  it("collects data models and table mixins from decorator state", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Accounts {
        @tableMixin
        model AuditFields {
          createdAt: utcDateTime;
        }

        @data("User Form")
        model UserForm {
          email: string;
        }

        @table
        model User is AuditFields {
          @key id: uuid;
        }
      }
    `);

    const dataModels = collectDataModels(runner.program);
    const mixins = collectTableMixins(runner.program);

    expect(dataModels).toHaveLength(1);
    expect(dataModels[0].label).toBe("User Form");
    expect(getTypeFullName(runner.program, dataModels[0].model)).toBe(
      "Test.Demo.Accounts.UserForm",
    );
    expect(mixins.map((model) => model.name)).toEqual(expect.arrayContaining(["AuditFields"]));
  });

  it("inherits docs and input types through lookup properties", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @inputType("password")
      scalar Password extends string;

      model Source {
        @doc("""
          Secret
          value
        """)
        secret: Password;
      }

      model Target {
        copiedSecret: Source.secret;
      }
    `);

    const target = runner.program
      .getGlobalNamespaceType()
      .namespaces.get("Test")!
      .models.get("Target");
    const copiedSecret = target?.properties.get("copiedSecret");

    expect(copiedSecret).toBeDefined();
    expect(getDoc(runner.program, copiedSecret!)).toBe("Secret value");
    expect(getInputTypeForProperty(runner.program, copiedSecret!)).toBe("password");
    expect(resolveDbType(copiedSecret!.type)).toBe("string");
  });

  it("falls back to format-derived input types and unwraps enums", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      enum Role {
        admin: "admin",
        user,
      }

      model User {
        @format("email")
        email: string;
        role: Role;
        roleCopy: User.role;
      }
    `);

    const user = runner.program
      .getGlobalNamespaceType()
      .namespaces.get("Test")!
      .models.get("User")!;
    const email = user.properties.get("email")!;
    const roleCopy = user.properties.get("roleCopy")!;

    expect(getInputTypeForProperty(runner.program, email)).toBe("email");
    expect(getPropertyEnum(roleCopy)).toEqual({
      enumType: user.properties.get("role")!.type,
      members: [
        { name: "admin", value: "admin" },
        { name: "user", value: "user" },
      ],
    });
  });

  it("resolves many-to-many associations and mapped-by relations", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Shop {
        @table
        model User {
          @key id: uuid;
          @mappedBy("user")
          profile?: Profile;
          @manyToMany("user_roles")
          roles: Role[];
        }

        @table
        model Profile {
          @key id: uuid;
          userId: uuid;
          @foreignKey("userId")
          @onDelete("CASCADE")
          user: User;
        }

        @table
        model Role {
          @key code: string;
          @manyToMany("user_roles")
          users: User[];
        }
      }
    `);

    const models = collectTableModels(runner.program).map((item) => item.model);
    const user = models.find((model) => model.name === "User") as Model;
    const role = models.find((model) => model.name === "Role") as Model;
    const profile = models.find((model) => model.name === "Profile") as Model;

    const rolesProp = user.properties.get("roles")!;
    const profileProp = user.properties.get("profile")!;
    const userProp = profile.properties.get("user")!;

    expect(deriveManyToManyJoinColumnName(runner.program, role, role.properties.get("code")!)).toBe(
      "role_code",
    );
    expect(collectManyToManyAssociations(runner.program, models)).toHaveLength(1);
    expect(resolveRelation(runner.program, rolesProp, user)).toMatchObject({
      kind: "many-to-many",
      targetTable: "roles",
      joinTable: "user_roles",
      backPopulates: "users",
    });
    expect(resolveRelation(runner.program, profileProp, user)).toMatchObject({
      kind: "one-to-one",
      targetTable: "profiles",
      backPopulates: "user",
      onDelete: "CASCADE",
    });
    expect(resolveRelation(runner.program, userProp, profile)).toMatchObject({
      kind: "many-to-one",
      fkColumnName: "user_id",
      fkTargetColumn: "id",
      backPopulates: "profile",
    });
  });
});
