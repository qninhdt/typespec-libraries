import { describe, expect, it } from "vitest";
import { formatColumnSettings, getDbmlType } from "../src/components/DbmlConstants.js";

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

  it("falls back to scalar names and built-in type names", () => {
    expect(getDbmlType({} as never, { kind: "Scalar", name: "text" } as never)).toBe("text");
    expect(getDbmlType({} as never, { kind: "Boolean" } as never)).toBe("boolean");
  });

  it("formats and sanitizes column settings", () => {
    expect(
      formatColumnSettings({
        pk: true,
        increment: true,
        notNull: true,
        unique: true,
        default: "pending",
        note: `line "one"\nline 'two'`,
      }),
    ).toBe(" [pk, increment, not null, unique, default: 'pending', note: 'line one line two']");
    expect(formatColumnSettings({})).toBe("");
  });
});
