/**
 * Scalar type mapping tests.
 */

import { describe, expect, it } from "vitest";
import { emitDbmlFile } from "./utils.js";

describe("DBML scalars", () => {
  it("maps uuid to uuid", async () => {
    const output = await emitDbmlFile(`@table model User { @key id: uuid; }`, "users.dbml");
    expect(output).toContain("id uuid");
  });

  it("maps string to varchar with default length", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; name: string; }`,
      "users.dbml",
    );
    expect(output).toContain("name varchar(255)");
  });

  it("maps string to varchar with default length", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; name: string; }`,
      "users.dbml",
    );
    expect(output).toContain("name varchar(255) [not null]");
  });

  it("maps text to text", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; bio: text; }`,
      "users.dbml",
    );
    expect(output).toContain("bio text");
  });

  it("maps boolean to boolean", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; isActive: boolean; }`,
      "users.dbml",
    );
    expect(output).toContain("is_active boolean");
  });

  it("maps int32 to integer", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; age: int32; }`,
      "users.dbml",
    );
    expect(output).toContain("age integer");
  });

  it("maps int64 to bigint", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; bigNum: int64; }`,
      "users.dbml",
    );
    expect(output).toContain("big_num bigint");
  });

  it("maps float32 to float", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; score: float32; }`,
      "users.dbml",
    );
    expect(output).toContain("score float");
  });

  it("maps float64 to double", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; score: float64; }`,
      "users.dbml",
    );
    expect(output).toContain("score double");
  });

  it("maps decimal with precision", async () => {
    const output = await emitDbmlFile(
      `@table model Product { @key id: uuid; @precision(10, 2) price: decimal; }`,
      "products.dbml",
    );
    expect(output).toContain("price decimal(10, 2)");
  });

  it("maps utcDateTime to timestamp", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; createdAt: utcDateTime; }`,
      "users.dbml",
    );
    expect(output).toContain("created_at timestamp");
  });

  it("maps plainDate to date", async () => {
    const output = await emitDbmlFile(
      `@table model Event { @key id: uuid; eventDate: plainDate; }`,
      "events.dbml",
    );
    expect(output).toContain("event_date date");
  });

  it("maps bytes to blob", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; avatar: bytes; }`,
      "users.dbml",
    );
    expect(output).toContain("avatar blob");
  });

  it("maps jsonb to jsonb", async () => {
    const output = await emitDbmlFile(
      `@table model User { @key id: uuid; metadata: jsonb; }`,
      "users.dbml",
    );
    expect(output).toContain("metadata jsonb");
  });

  it("maps serial to serial", async () => {
    const output = await emitDbmlFile(
      `@table model Counter { @key id: serial; value: int32; }`,
      "counters.dbml",
    );
    expect(output).toContain("id serial");
  });

  it("maps bigserial to bigserial", async () => {
    const output = await emitDbmlFile(
      `@table model Counter { @key id: bigserial; value: int32; }`,
      "counters.dbml",
    );
    expect(output).toContain("id bigserial");
  });
});
