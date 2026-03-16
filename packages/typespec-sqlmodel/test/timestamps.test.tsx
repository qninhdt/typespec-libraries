import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel @autoCreateTime", () => {
  it("generates sa_column with DateTime(timezone=True) and server_default=func.now()", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @autoCreateTime createdAt: utcDateTime;
      }
    `,
      "user.py",
    );

    expect(output).toContain("created_at: datetime");
    expect(output).toContain("DateTime(timezone=True)");
    expect(output).toContain("server_default=func.now()");
    expect(output).toContain("from sqlalchemy import");
    expect(output).toContain("func");
  });
});

describe("SQLModel @autoUpdateTime", () => {
  it("generates sa_column with onupdate=func.now()", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @autoUpdateTime updatedAt?: utcDateTime;
      }
    `,
      "user.py",
    );

    expect(output).toContain("updated_at: datetime | None");
    expect(output).toContain("onupdate=func.now()");
    expect(output).toContain("DateTime(timezone=True)");
  });
});

describe("SQLModel @softDelete", () => {
  it("generates datetime | None field with index and default=None", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @softDelete deletedAt?: utcDateTime;
      }
    `,
      "user.py",
    );

    expect(output).toContain("deleted_at: datetime | None");
    expect(output).toContain("default=None");
    expect(output).toContain("index=True");
    expect(output).toContain("DateTime(timezone=True)");
  });
});
