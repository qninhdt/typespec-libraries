import { describe, expect, it } from "vitest";
import {
  formatColumnSettings,
  getDbmlType,
  DBML_TYPE_MAP,
} from "../src/components/DbmlConstants.js";

describe("DBML constants helpers", () => {
  it("unwraps model-property lookup types and array item types", () => {
    const scalar = { kind: "Scalar", name: "uuid" };
    const lookup = { kind: "ModelProperty", type: scalar };
    const list = { kind: "Model", indexer: { value: scalar } };
    const unknownList = {
      kind: "Model",
      indexer: { value: { kind: "Model", properties: new Map() } },
    };

    expect(getDbmlType({} as never, lookup as never)).toBe("uuid");
    expect(getDbmlType({} as never, list as never)).toBe("uuid[]");
    expect(getDbmlType({} as never, unknownList as never)).toBe("jsonb");
  });

  it("falls back to scalar names for known types", () => {
    expect(getDbmlType({} as never, { kind: "Scalar", name: "text" } as never)).toBe("text");
    expect(getDbmlType({} as never, { kind: "Scalar", name: "boolean" } as never)).toBe("boolean");
  });

  it("returns undefined for unrecognized types", () => {
    expect(
      getDbmlType({} as never, { kind: "Scalar", name: "unknown_custom" } as never),
    ).toBeUndefined();
    expect(getDbmlType({} as never, { kind: "Union" } as never)).toBeUndefined();
  });

  it("formats and sanitizes column settings", () => {
    expect(
      formatColumnSettings({
        pk: true,
        notNull: true,
        unique: true,
        default: "pending",
        note: `line "one"\nline 'two'`,
      }),
    ).toBe(
      ` [pk, not null, unique, default: 'pending', note: '''line "one"\nline 'two\\'''']`,
    );
    expect(formatColumnSettings({})).toBe("");
  });

  it("escapes single quotes in default settings", () => {
    expect(formatColumnSettings({ default: "O'Reilly" })).toBe(" [default: 'O\\'Reilly']");
  });
});

describe("formatColumnSettings individual options", () => {
  it("formats pk only", () => {
    expect(formatColumnSettings({ pk: true })).toBe(" [pk]");
  });

  it("formats not null only", () => {
    expect(formatColumnSettings({ notNull: true })).toBe(" [not null]");
  });

  it("formats unique only", () => {
    expect(formatColumnSettings({ unique: true })).toBe(" [unique]");
  });

  it("uses backtick syntax for function call defaults", () => {
    expect(formatColumnSettings({ default: "now()" })).toBe(" [default: `now()`]");
  });

  it("uses backtick syntax for numeric defaults", () => {
    expect(formatColumnSettings({ default: "42" })).toBe(" [default: `42`]");
    expect(formatColumnSettings({ default: "-3.14" })).toBe(" [default: `-3.14`]");
  });

  it("uses backtick syntax for boolean defaults", () => {
    expect(formatColumnSettings({ default: "true" })).toBe(" [default: `true`]");
    expect(formatColumnSettings({ default: "false" })).toBe(" [default: `false`]");
  });

  it("uses single-quote syntax for string defaults", () => {
    expect(formatColumnSettings({ default: "active" })).toBe(" [default: 'active']");
  });

  it("preserves empty string defaults", () => {
    expect(formatColumnSettings({ default: "" })).toBe(" [default: '']");
  });

  it("escapes backslashes in default values", () => {
    expect(formatColumnSettings({ default: "path\\to" })).toBe(" [default: 'path\\\\to']");
  });

  it("uses triple-quoted long form when a note contains quotes or backticks", () => {
    expect(formatColumnSettings({ note: 'has "quotes" and `backticks`' })).toBe(
      " [note: '''has \"quotes\" and `backticks`''']",
    );
  });

  it("preserves apostrophes inside long-form notes without losing them", () => {
    // Apostrophes embedded mid-string don't need escaping inside `'''...'''`.
    expect(formatColumnSettings({ note: "can't \"do this\"" })).toBe(
      " [note: '''can't \"do this\"''']",
    );
  });

  it("escapes trailing apostrophes that would collide with the closing delimiter", () => {
    expect(formatColumnSettings({ note: "ends in quote'" })).toBe(
      " [note: '''ends in quote\\'''']",
    );
  });

  it("escapes triple-apostrophe runs inside long-form notes", () => {
    expect(formatColumnSettings({ note: "a'''b\n" })).toBe(
      " [note: '''a\\'\\'\\'b\n''']",
    );
  });

  it("preserves newlines in long-form notes", () => {
    expect(formatColumnSettings({ note: "line1\nline2" })).toBe(
      " [note: '''line1\nline2''']",
    );
  });

  it("normalizes Windows-style newlines to LF in long-form notes", () => {
    expect(formatColumnSettings({ note: "line1\r\nline2" })).toBe(
      " [note: '''line1\nline2''']",
    );
  });
});

describe("DBML_TYPE_MAP", () => {
  it("contains all expected scalar types", () => {
    const expectedKeys = [
      "uuid",
      "string",
      "text",
      "boolean",
      "int8",
      "int16",
      "int32",
      "int64",
      "uint8",
      "uint16",
      "uint32",
      "uint64",
      "float32",
      "float64",
      "decimal",
      "serial",
      "bigserial",
      "utcDateTime",
      "date",
      "time",
      "duration",
      "bytes",
      "jsonb",
    ];
    for (const key of expectedKeys) {
      expect(DBML_TYPE_MAP).toHaveProperty(key);
      expect(DBML_TYPE_MAP[key]).toBeTruthy();
    }
  });

  it("maps integer types correctly", () => {
    expect(DBML_TYPE_MAP.int8).toBe("smallint");
    expect(DBML_TYPE_MAP.int16).toBe("smallint");
    expect(DBML_TYPE_MAP.int32).toBe("integer");
    expect(DBML_TYPE_MAP.int64).toBe("bigint");
    expect(DBML_TYPE_MAP.uint32).toBe("bigint");
    expect(DBML_TYPE_MAP.uint64).toBe("bigint");
  });

  it("maps temporal types correctly", () => {
    expect(DBML_TYPE_MAP.utcDateTime).toBe("timestamptz");
    expect(DBML_TYPE_MAP.date).toBe("date");
    expect(DBML_TYPE_MAP.time).toBe("time");
    expect(DBML_TYPE_MAP.duration).toBe("interval");
  });

  it("maps float types correctly", () => {
    expect(DBML_TYPE_MAP.float32).toBe("real");
    expect(DBML_TYPE_MAP.float64).toBe("double precision");
  });
});
