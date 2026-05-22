import { Model, ModelProperty } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import {
  collectTableModels,
  collectDataModels,
  getColumnName,
  getOrmScalarName,
  getDoc,
  getForeignKey,
  getForeignKeyTarget,
  getMaxLength,
  getMinLength,
  getMinValue,
  getMaxValue,
  getOnDelete,
  getOnUpdate,
  getPattern,
  getPrecision,
  getTitle,
  getPlaceholder,
  getCompositeFields,
  getGoType,
  getIndexUsing,
  getPolymorphicConfig,
  getRefines,
  isAutoCreateTime,
  isAutoIncrement,
  isAutoUpdateTime,
  isIndex,
  isPolymorphicProperty,
  isSoftDelete,
  isUnique,
} from "@qninhdt/typespec-orm";
import { createTestRunner } from "./utils.js";

describe("@table decorator", () => {
  it("marks a model as a table", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        name: string;
      }
    `);

    const tables = collectTableModels(runner.program);
    expect(tables).toHaveLength(1);
    expect(tables[0].model.name).toBe("User");
  });

  it("uses custom table name", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table("custom_users")
      model User {
        @key id: uuid;
        name: string;
      }
    `);

    const tables = collectTableModels(runner.program);
    expect(tables).toHaveLength(1);
    expect(tables[0].tableName).toBe("custom_users");
  });

  it("derives snake_case table name from PascalCase model name", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model StoryNode {
        @key id: uuid;
        title: string;
      }
    `);

    const tables = collectTableModels(runner.program);
    expect(tables).toHaveLength(1);
    expect(tables[0].tableName).toBe("story_nodes");
  });
});

describe("@map decorator", () => {
  it("sets a custom column name", async () => {
    const runner = await createTestRunner();
    const { name } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @map("user_name") name: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(getColumnName(runner.program, name)).toBe("user_name");
  });
});

describe("@index decorator", () => {
  it("marks a property as indexed", async () => {
    const runner = await createTestRunner();
    const { email } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @index email: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(isIndex(runner.program, email)).toBe(true);
  });
});

describe("@unique decorator", () => {
  it("marks a property as unique", async () => {
    const runner = await createTestRunner();
    const { email } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @unique email: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(isUnique(runner.program, email)).toBe(true);
  });

  it("honors an explicit @unique(name) override", async () => {
    const runner = await createTestRunner();
    const { email } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @unique("user_email_uq") email: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(isUnique(runner.program, email)).toBe(true);
    const { getUniqueName } = await import("@qninhdt/typespec-orm");
    expect(getUniqueName(runner.program, email)).toBe("user_email_uq");
  });

  it("falls back to the auto-derived unique name when no argument given", async () => {
    const runner = await createTestRunner();
    const { email } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @unique email: string;
      }
    `)) as Record<string, ModelProperty>;

    const { getUniqueName } = await import("@qninhdt/typespec-orm");
    expect(getUniqueName(runner.program, email)).toBe("users_email_unique");
  });
});

describe("@autoIncrement decorator", () => {
  it("marks a property as auto-increment", async () => {
    const runner = await createTestRunner();
    const { id } = (await runner.compile(`
      @table
      model User {
        @test @key @autoIncrement id: serial;
        name: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(isAutoIncrement(runner.program, id)).toBe(true);
  });
});

describe("@softDelete decorator", () => {
  it("marks a property as soft delete", async () => {
    const runner = await createTestRunner();
    const { deletedAt } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @softDelete deletedAt?: utcDateTime;
      }
    `)) as Record<string, ModelProperty>;

    expect(isSoftDelete(runner.program, deletedAt)).toBe(true);
  });
});

describe("@foreignKey decorator", () => {
  it("sets a foreign key column name", async () => {
    const runner = await createTestRunner();
    const { userId } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
      }
      @table
      model Post {
        @test @key id: uuid;
        @test @foreignKey("user_id") userId: uuid;
      }
    `)) as Record<string, ModelProperty>;

    const fk = getForeignKey(runner.program, userId);
    expect(fk).toBeDefined();
    expect(fk).toBe("user_id");
  });

  it("stores the optional referenced target field", async () => {
    const runner = await createTestRunner();
    const { organization } = (await runner.compile(`
      @table
      model Organization {
        @key code: string;
      }

      @table
      model User {
        organizationCode: string;
        @test @foreignKey("organizationCode", "code") organization: Organization;
      }
    `)) as Record<string, ModelProperty>;

    expect(getForeignKey(runner.program, organization)).toBe("organizationCode");
    expect(getForeignKeyTarget(runner.program, organization)).toBe("code");
  });
});

describe("@mappedBy decorator", () => {
  it("sets the inverse property name for one-to-many", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @mappedBy("user")
        posts: Post[];
      }
      @table
      model Post {
        @key id: uuid;
        @foreignKey("user_id")
        user: User;
      }
    `);
    // Just verify it compiles without error
    expect(runner.program.diagnostics.length).toBe(0);
  });
});

describe("@autoCreateTime decorator", () => {
  it("marks a property as auto-create timestamp", async () => {
    const runner = await createTestRunner();
    const { createdAt } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @autoCreateTime createdAt: utcDateTime;
      }
    `)) as Record<string, ModelProperty>;

    expect(isAutoCreateTime(runner.program, createdAt)).toBe(true);
  });
});

describe("@autoUpdateTime decorator", () => {
  it("marks a property as auto-update timestamp", async () => {
    const runner = await createTestRunner();
    const { updatedAt } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @autoUpdateTime updatedAt: utcDateTime;
      }
    `)) as Record<string, ModelProperty>;

    expect(isAutoUpdateTime(runner.program, updatedAt)).toBe(true);
  });
});

describe("@precision decorator", () => {
  it("sets precision and scale on decimal", async () => {
    const runner = await createTestRunner();
    const { price } = (await runner.compile(`
      @table
      model Product {
        @test @key id: uuid;
        @test @precision(10, 2) price: decimal;
      }
    `)) as Record<string, ModelProperty>;

    const prec = getPrecision(runner.program, price);
    expect(prec).toBeDefined();
    expect(prec!.precision).toBe(10);
    expect(prec!.scale).toBe(2);
  });
});

describe("@onDelete decorator", () => {
  it("sets cascade delete action", async () => {
    const runner = await createTestRunner();
    const { user } = (await runner.compile(`
      @table
      model Post {
        @test @key id: uuid;
        @test @foreignKey("user_id") @onDelete("CASCADE") user: User;
      }
      @table
      model User {
        @key id: uuid;
      }
    `)) as Record<string, ModelProperty>;

    expect(getOnDelete(runner.program, user)).toBe("CASCADE");
  });
});

describe("@onUpdate decorator", () => {
  it("sets cascade update action", async () => {
    const runner = await createTestRunner();
    const { user } = (await runner.compile(`
      @table
      model Post {
        @test @key id: uuid;
        @test @foreignKey("user_id") @onUpdate("CASCADE") user: User;
      }
      @table
      model User {
        @key id: uuid;
      }
    `)) as Record<string, ModelProperty>;

    expect(getOnUpdate(runner.program, user)).toBe("CASCADE");
  });
});

describe("composite<> type", () => {
  it("extracts composite fields from property", async () => {
    const runner = await createTestRunner();
    const { Test } = (await runner.compile(`
      @table
      @test model Test {
        @key id: uuid;
        name: string;
        email: string;
        @unique
        idxNameEmail: composite<"name", "email">;
      }
    `)) as Record<string, Model>;

    const props = Test.properties;
    const idxProp = props.get("idxNameEmail")!;
    const compositeFields = getCompositeFields(runner.program, idxProp);
    expect(compositeFields).toEqual(["name", "email"]);
  });

  it("extracts composite fields with @key for primary index", async () => {
    const runner = await createTestRunner();
    const { Test } = (await runner.compile(`
      @table
      @test model Test {
        @key id: uuid;
        @key
        primaryIdx: composite<"tenantId", "code">;
        tenantId: string;
        code: string;
      }
    `)) as Record<string, Model>;

    const props = Test.properties;
    const idxProp = props.get("primaryIdx")!;
    const compositeFields = getCompositeFields(runner.program, idxProp);
    expect(compositeFields).toEqual(["tenantId", "code"]);
  });
});

describe("data models (auto-detected)", () => {
  it("auto-detects models without @table/@tableMixin as data models", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      model LoginForm {
        email: string;
        password: string;
      }
    `);

    const dataModels = collectDataModels(runner.program);
    expect(dataModels).toHaveLength(1);
    expect(dataModels[0].model.name).toBe("LoginForm");
    expect(dataModels[0].label).toBe("LoginForm");
  });
});

describe("@polymorphic decorator", () => {
  it("captures allowedTypes and idColumn", async () => {
    const runner = await createTestRunner();
    const { ownerType } = (await runner.compile(`
      @table
      model Workspace {
        @key id: uuid;
        @test
        @polymorphic(#["user", "team"], "owner_id")
        ownerType: string;
        ownerId: uuid;
      }
    `)) as Record<string, ModelProperty>;

    expect(isPolymorphicProperty(runner.program, ownerType)).toBe(true);
    const cfg = getPolymorphicConfig(runner.program, ownerType);
    expect(cfg?.allowedTypes).toEqual(["user", "team"]);
    expect(cfg?.idColumn).toBe("owner_id");
  });

  it("works without idColumn", async () => {
    const runner = await createTestRunner();
    const { kind } = (await runner.compile(`
      @table
      model Event {
        @key id: uuid;
        @test
        @polymorphic(#["click", "view"])
        kind: string;
      }
    `)) as Record<string, ModelProperty>;

    const cfg = getPolymorphicConfig(runner.program, kind);
    expect(cfg?.allowedTypes).toEqual(["click", "view"]);
    expect(cfg?.idColumn).toBeUndefined();
  });
});

describe("@indexUsing decorator", () => {
  it("captures the index method", async () => {
    const runner = await createTestRunner();
    const { search } = (await runner.compile(`
      @table
      model Document {
        @key id: uuid;
        @test
        @index
        @indexUsing("gin")
        search: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(getIndexUsing(runner.program, search)).toBe("gin");
  });
});

describe("@goType decorator", () => {
  it("parses import path and type name", async () => {
    const runner = await createTestRunner();
    const { payload } = (await runner.compile(`
      @table
      model Job {
        @key id: uuid;
        @test
        @goType("github.com/example/types.JobPayload")
        payload: Record<unknown>;
      }
    `)) as Record<string, ModelProperty>;

    const spec = getGoType(runner.program, payload);
    expect(spec?.importPath).toBe("github.com/example/types");
    expect(spec?.typeName).toBe("JobPayload");
  });
});

describe("@refine decorator", () => {
  it("collects multiple refinements per model", async () => {
    const runner = await createTestRunner();
    const { Form } = (await runner.compile(`
      @test
      model Form {
        email: string;
        password: string;
        confirm: string;
      }
      @@refine(Form, "passwordMatch", "data.password === data.confirm");
      @@refine(Form, "nonEmpty", "data.email.length > 0");
    `)) as Record<string, Model>;

    const refines = getRefines(runner.program, Form);
    expect(refines).toHaveLength(2);
    expect(refines[0]).toEqual({
      name: "passwordMatch",
      expression: "data.password === data.confirm",
    });
    expect(refines[1].name).toBe("nonEmpty");
  });
});

describe("@title decorator", () => {
  it("sets a title for a form field", async () => {
    const runner = await createTestRunner();
    const { email } = (await runner.compile(`
      model LoginForm {
        @test @title("Email Address") email: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(getTitle(runner.program, email)).toBe("Email Address");
  });
});

describe("@placeholder decorator", () => {
  it("sets a placeholder for a form field", async () => {
    const runner = await createTestRunner();
    const { email } = (await runner.compile(`
      model LoginForm {
        @test @placeholder("Enter your email") email: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(getPlaceholder(runner.program, email)).toBe("Enter your email");
  });
});

describe("TypeSpec built-in decorators with ORM", () => {
  it("reads @maxLength", async () => {
    const runner = await createTestRunner();
    const { name } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @maxLength(255) name: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(getMaxLength(runner.program, name)).toBe(255);
  });

  it("reads @minLength", async () => {
    const runner = await createTestRunner();
    const { name } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @minLength(1) name: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(getMinLength(runner.program, name)).toBe(1);
  });

  it("reads @minValue and @maxValue", async () => {
    const runner = await createTestRunner();
    const { age } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test @minValue(0) @maxValue(200) age: int32;
      }
    `)) as Record<string, ModelProperty>;

    expect(getMinValue(runner.program, age)).toBe(0);
    expect(getMaxValue(runner.program, age)).toBe(200);
  });

  it("reads @doc", async () => {
    const runner = await createTestRunner();
    const { name } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        /** The user's display name */
        @test name: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(getDoc(runner.program, name)).toBe("The user's display name");
  });

  it("reads @pattern", async () => {
    const runner = await createTestRunner();
    const { code } = (await runner.compile(`
      @table
      model Product {
        @test @key id: uuid;
        @test @pattern("[A-Z]{3}-[0-9]{4}") code: string;
      }
    `)) as Record<string, ModelProperty>;

    expect(getPattern(runner.program, code)).toBe("[A-Z]{3}-[0-9]{4}");
  });

  it("resolves ORM semantic scalar", async () => {
    const runner = await createTestRunner();
    const { email } = (await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @test email: email;
      }
    `)) as Record<string, ModelProperty>;

    expect(getOrmScalarName(email.type)).toBe("email");
  });
});
