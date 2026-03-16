/**
 * Constraint tests - indexes, unique, primary keys.
 */

import { describe, expect, it } from "vitest";
import { emitDbmlFile } from "./utils.js";

describe("DBML constraints", () => {
  it("generates primary key", async () => {
    const output = await emitDbmlFile(`@table model User { @key id: uuid; }`, "users.dbml");
    expect(output).toContain("id uuid [pk, not null]");
  });

  it("generates not null for non-optional fields", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; name: string; }`,
      "users.dbml",
    );
    expect(output).toContain("name varchar(255) [not null]");
  });

  it("generates nullable for optional fields", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; nickname?: string; }`,
      "users.dbml",
    );
    expect(output).toContain("nickname varchar(255)");
  });

  it("generates unique constraint", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; @unique email: string; }`,
      "users.dbml",
    );
    expect(output).toContain("email varchar(255) [not null]");
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
    expect(output).toContain("id serial [pk, increment, not null]");
  });

  it("generates composite index via composite<> type", async () => {
    const output = await emitDbmlFile(
      `@table model Post { @key id: uuid; authorId: uuid; status: string; authorStatus: composite<"authorId", "status">; }`,
      "posts.dbml",
    );
    expect(output).toContain("indexes {");
    expect(output).toContain("(author_id, status)");
  });

  it("generates composite unique constraint via composite<> type", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; email: string; deletedAt?: utcDateTime; @unique emailDeletedAt: composite<"email", "deletedAt">; }`,
      "users.dbml",
    );
    expect(output).toContain("indexes {");
    expect(output).toContain("(email, deleted_at) [unique]");
  });

  it("generates composite primary key via composite<> type with @key", async () => {
    const output = await emitDbmlFile(
      `@table model Membership { @key userRole: composite<"userId", "roleId">; userId: uuid; roleId: uuid; }`,
      "memberships.dbml",
    );
    expect(output).toContain("indexes {");
    expect(output).toContain("(user_id, role_id) [pk]");
  });
});
