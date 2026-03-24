import { describe, expect, it } from "vitest";
import { createTestRunner } from "./utils.js";
import { $onValidate } from "../src/validators.js";

describe("$onValidate diagnostics", () => {
  it("reports multiple @key on same model", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key
        id1: uuid;
        @key
        id2: uuid;
        name: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/multiple-keys",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("reports duplicate table names", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table("users")
      model User {
        @test @key id: uuid;
        name: string;
      }

      @table("users")
      model Admin {
        @test @key id: uuid;
        name: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/duplicate-table-name",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("reports @softDelete on non-datetime type", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @softDelete deleted: boolean;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/soft-delete-on-non-datetime",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("reports multiple @softDelete on same model", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @softDelete deletedAt?: utcDateTime;
        @softDelete removedAt?: utcDateTime;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/multiple-soft-deletes",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("warns about redundant @unique on @key", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key
        @unique
        id: uuid;
        name: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/redundant-unique-on-key",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
  });

  it("warns about redundant @index on @unique", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @unique @index email: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/redundant-index-on-unique",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
  });

  it("allows valid model without diagnostics", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        name: string;
        @unique email: string;
      }
    `);
    $onValidate(runner.program);

    const ormDiagnostics = runner.program.diagnostics.filter(
      (d) => d.code?.startsWith("@qninhdt/typespec-orm/") && d.severity === "error",
    );
    expect(ormDiagnostics).toHaveLength(0);
  });

  it("reports missing local FK field", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key id: uuid;
      }

      @table
      model User {
        @key id: uuid;
        @foreignKey("organizationId")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-local-missing",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports missing target FK field", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key id: uuid;
      }

      @table
      model User {
        @key id: uuid;
        organizationCode: string;
        @foreignKey("organizationCode", "code")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-target-missing",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports incompatible FK column types", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key code: string;
      }

      @table
      model User {
        @key id: uuid;
        organizationCode: uuid;
        @foreignKey("organizationCode", "code")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-type-mismatch",
    );
    expect(diags).toHaveLength(1);
  });

  it('reports @onDelete("SET NULL") on a non-nullable FK field', async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key id: uuid;
      }

      @table
      model User {
        @key id: uuid;
        organizationId: uuid;
        @foreignKey("organizationId")
        @onDelete("SET NULL")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-set-null-non-nullable",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports missing @mappedBy target property", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @mappedBy("owner")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        userId: uuid;
        @foreignKey("userId")
        user: User;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/mapped-by-missing-property",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports one-to-one inverse relations without a unique local FK", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @mappedBy("user")
        profile?: Profile;
      }

      @table
      model Profile {
        @key id: uuid;
        userId: uuid;
        @foreignKey("userId")
        user: User;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/one-to-one-missing-unique",
    );
    expect(diags).toHaveLength(1);
  });

  it("accepts a valid non-id referenced column relation", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key
        @unique
        code: string;
      }

      @table
      model User {
        @key id: uuid;
        organizationCode: string;
        @foreignKey("organizationCode", "code")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const ormErrors = runner.program.diagnostics.filter(
      (d) =>
        d.code?.startsWith("@qninhdt/typespec-orm/") &&
        d.severity === "error" &&
        !d.code.endsWith("namespace-required"),
    );
    expect(ormErrors).toHaveLength(0);
  });
});
