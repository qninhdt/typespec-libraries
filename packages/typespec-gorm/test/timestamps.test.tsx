import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("GORM @autoCreateTime", () => {
  it("generates autoCreateTime tag on time.Time field", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @autoCreateTime createdAt: utcDateTime;
      }
    `,
      "user.go",
    );

    const line = output.split("\n").find((l) => l.includes("CreatedAt "));
    expect(line).toBeDefined();
    expect(line).toContain("time.Time");
    expect(line).toContain("autoCreateTime");
    expect(line).toContain("type:timestamptz");
    expect(line).toContain("not null");
  });
});

describe("GORM @autoUpdateTime", () => {
  it("generates autoUpdateTime tag on time.Time field", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @autoUpdateTime updatedAt: utcDateTime;
      }
    `,
      "user.go",
    );

    const line = output.split("\n").find((l) => l.includes("UpdatedAt "));
    expect(line).toBeDefined();
    expect(line).toContain("autoUpdateTime");
    expect(line).toContain("type:timestamptz");
  });

  it("generates optional autoUpdateTime with pointer type", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @autoUpdateTime updatedAt?: utcDateTime;
      }
    `,
      "user.go",
    );

    // Optional → pointer
    expect(output).toContain("*time.Time");
    expect(output).toContain("autoUpdateTime");
  });
});

describe("GORM @softDelete", () => {
  it("generates gorm.DeletedAt with index and gorm.io/gorm import", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        @softDelete deletedAt?: utcDateTime;
      }
    `,
      "user.go",
    );

    // Should use gorm.DeletedAt, not *time.Time
    expect(output).toContain("DeletedAt gorm.DeletedAt");
    // Should have index for soft delete queries
    expect(output).toContain("index");
    // Should import gorm.io/gorm
    expect(output).toContain('"gorm.io/gorm"');
    // Should NOT have autoCreateTime/autoUpdateTime
    const line = output.split("\n").find((l) => l.includes("DeletedAt "));
    expect(line).not.toContain("autoCreateTime");
    expect(line).not.toContain("autoUpdateTime");
  });
});
