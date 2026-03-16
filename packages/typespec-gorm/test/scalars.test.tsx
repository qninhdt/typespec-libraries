import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("Go scalar type mappings", () => {
  it("maps uuid to uuid.UUID with correct import", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
      }
    `,
      "user.go",
    );

    expect(output).toContain("\tID uuid.UUID");
    expect(output).toContain('"github.com/google/uuid"');
    expect(output).toContain("type:uuid");
  });

  it("maps string to string with varchar(255)", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain("\tName string");
    expect(output).toContain("type:varchar(255)");
  });

  it("maps text to string with text type", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        bio: text;
      }
    `,
      "user.go",
    );

    expect(output).toContain("\tBio string");
    expect(output).toContain("type:text");
  });

  it("maps boolean to bool", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        active: boolean;
      }
    `,
      "user.go",
    );

    expect(output).toContain("\tActive bool");
    expect(output).toContain("type:boolean");
  });

  it("maps integer types to correct Go types", async () => {
    const output = await emitGoFile(
      `
      @table
      model IntTest {
        @key id: uuid;
        a: int8;
        b: int16;
        c: int32;
        d: int64;
        e: uint8;
        f: uint16;
        g: uint32;
        h: uint64;
      }
    `,
      "int_test.go",
    );

    expect(output).toContain("\tA int8");
    expect(output).toContain("\tB int16");
    expect(output).toContain("\tC int32");
    expect(output).toContain("\tD int64");
    expect(output).toContain("\tE uint8");
    expect(output).toContain("\tF uint16");
    expect(output).toContain("\tG uint32");
    expect(output).toContain("\tH uint64");
  });

  it("maps float types to correct Go types", async () => {
    const output = await emitGoFile(
      `
      @table
      model FloatTest {
        @key id: uuid;
        a: float32;
        b: float64;
      }
    `,
      "float_test.go",
    );

    expect(output).toContain("\tA float32");
    expect(output).toContain("type:real");
    expect(output).toContain("\tB float64");
    expect(output).toContain("type:double precision");
  });

  it("maps decimal to decimal.Decimal with import", async () => {
    const output = await emitGoFile(
      `
      @table
      model Product {
        @key id: uuid;
        price: decimal;
      }
    `,
      "product.go",
    );

    expect(output).toContain("\tPrice decimal.Decimal");
    expect(output).toContain('"github.com/shopspring/decimal"');
    expect(output).toContain("type:numeric");
  });

  it("maps serial to int32 with autoIncrement", async () => {
    const output = await emitGoFile(
      `
      @table
      model Post {
        @key id: serial;
      }
    `,
      "post.go",
    );

    expect(output).toContain("\tID int32");
    expect(output).toContain("autoIncrement");
  });

  it("maps utcDateTime to time.Time with timestamptz", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        eventAt: utcDateTime;
      }
    `,
      "user.go",
    );

    expect(output).toContain("\tEventAt time.Time");
    expect(output).toContain("type:timestamptz");
    expect(output).toContain('"time"');
  });

  it("maps bytes to []byte with bytea", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        data: bytes;
      }
    `,
      "user.go",
    );

    expect(output).toContain("\tData []byte");
    expect(output).toContain("type:bytea");
  });

  it("uses pointer type for optional fields", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        bio?: string;
        age?: int32;
      }
    `,
      "user.go",
    );

    // Required -no pointer
    expect(output).toContain("\tName string");
    // Optional -pointer
    expect(output).toContain("\tBio *string");
    expect(output).toContain("\tAge *int32");
  });

  it("generates correct column names using camelToSnake", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        displayName: string;
        avatarUrl?: string;
        isActive: boolean;
      }
    `,
      "user.go",
    );

    expect(output).toContain("column:display_name");
    expect(output).toContain("column:avatar_url");
    expect(output).toContain("column:is_active");
  });

  it("generates only needed imports", async () => {
    // Model with only uuid -should NOT import "time"
    const output = await emitGoFile(
      `
      @table
      model Simple {
        @key id: uuid;
        name: string;
      }
    `,
      "simple.go",
    );

    expect(output).toContain('"github.com/google/uuid"');
    expect(output).not.toContain('"time"');
    expect(output).not.toContain('"gorm.io/gorm"');
  });
});
