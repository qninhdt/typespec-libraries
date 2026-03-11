import { describe, expect, it } from "vitest";
import { createTestRunner } from "./utils.js";
import { $onValidate } from "../src/validators.js";

describe("$onValidate diagnostics", () => {
  it("reports multiple @id on same model", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @test @id id1: uuid;
        @test @id id2: uuid;
        name: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/multiple-ids",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("reports duplicate table names", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table("users")
      model User {
        @test @id id: uuid;
        name: string;
      }

      @table("users")
      model Admin {
        @test @id id: uuid;
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
        @test @id id: uuid;
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
        @test @id id: uuid;
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

  it("warns about redundant @unique on @id", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @test @id @unique id: uuid;
        name: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/redundant-unique-on-id",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
  });

  it("warns about redundant @index on @unique", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @test @id id: uuid;
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
        @test @id id: uuid;
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
});
