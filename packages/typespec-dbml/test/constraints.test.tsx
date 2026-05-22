/**
 * Constraint tests - indexes, unique, primary keys.
 */

import { describe, expect, it } from "vitest";
import { emitDbmlFile } from "./utils.js";

describe("DBML constraints", () => {
  it("generates primary key", async () => {
    const output = await emitDbmlFile(`@table model User { @key id: uuid; }`, "users.dbml");
    expect(output).toContain("id uuid [pk]");
  });

  it("generates not null for non-optional fields", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; name: string; }`,
      "users.dbml",
    );
    expect(output).toContain("name text [not null]");
  });

  it("generates nullable for optional fields", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; nickname?: string; }`,
      "users.dbml",
    );
    expect(output).toContain("nickname text");
  });

  it("generates unique constraint", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; @unique email: string; }`,
      "users.dbml",
    );
    expect(output).toContain("email text [not null]");
    expect(output).toContain("email [unique]");
  });

  it("generates index", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; @index status: string; }`,
      "users.dbml",
    );
    expect(output).toContain("indexes {");
    expect(output).toContain("status");
  });

  it("generates @autoIncrement", async () => {
    const output = await emitDbmlFile(
      `@table model Counter { @key @autoIncrement id: serial; }`,
      "counters.dbml",
    );
    expect(output).toContain("id serial [pk, increment]");
  });

  it("generates composite index via composite<> type", async () => {
    const output = await emitDbmlFile(
      `@table model Post { @key id: uuid; authorId: uuid; status: string; authorStatus: composite<"authorId", "status">; }`,
      "posts.dbml",
    );
    expect(output).toContain("indexes {");
    expect(output).toContain("(author_id, status)");
  });

  it("resolves composite indexes through mapped property names", async () => {
    const output = await emitDbmlFile(
      `@table model Post { @key id: uuid; @map("authorId") authorId: uuid; status: string; authorStatus: composite<"authorId", "status">; }`,
      "posts.dbml",
    );
    expect(output).toContain("authorId uuid [not null]");
    expect(output).toContain("(authorId, status)");
  });

  it("generates composite unique constraint via composite<> type", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; email: string; deletedAt?: utcDateTime; @unique emailDeletedAt: composite<"email", "deletedAt">; }`,
      "users.dbml",
    );
    expect(output).toContain("indexes {");
    expect(output).toContain("(email, deleted_at) [unique]");
  });

  it("generates inherited composite constraints", async () => {
    const output = await emitDbmlFile(
      `
      model TenantScoped {
        tenantId: uuid;
        code: string;
        @unique tenantCode: composite<"tenantId", "code">;
      }

      @table
      model Project extends TenantScoped {
        @key id: uuid;
      }
    `,
      "projects.dbml",
    );

    expect(output).toContain("tenant_id uuid [not null]");
    expect(output).toContain("code text [not null]");
    expect(output).toContain("(tenant_id, code) [unique]");
  });

  it("generates composite primary key via composite<> type with @key", async () => {
    const output = await emitDbmlFile(
      `@table model Membership { @key userRole: composite<"userId", "roleId">; userId: uuid; roleId: uuid; }`,
      "memberships.dbml",
    );
    expect(output).toContain("indexes {");
    expect(output).toContain("(user_id, role_id) [pk]");
  });

  it("emits not null for non-optional @autoUpdateTime columns", async () => {
    const output = await emitDbmlFile(
      `@table model Doc { @key id: uuid; @autoUpdateTime updatedAt: utcDateTime; }`,
      "docs.dbml",
    );
    expect(output).toContain("updated_at timestamptz [not null, default: `now()`]");
  });

  it("emits not null for non-optional @autoCreateTime columns", async () => {
    const output = await emitDbmlFile(
      `@table model Doc { @key id: uuid; @autoCreateTime createdAt: utcDateTime; }`,
      "docs.dbml",
    );
    expect(output).toContain("created_at timestamptz [not null, default: `now()`]");
  });

  it("keeps optional @autoUpdateTime columns nullable", async () => {
    const output = await emitDbmlFile(
      `@table model Doc { @key id: uuid; @autoUpdateTime updatedAt?: utcDateTime; }`,
      "docs.dbml",
    );
    expect(output).toContain("updated_at timestamptz [default: `now()`]");
    expect(output).not.toContain("updated_at timestamptz [not null");
  });
});
