import { describe, expect, it } from "vitest";
import {
  escapeFormTagValue,
  escapeComment,
  goStringLiteral,
  buildDocComment,
  buildImportBlock,
  buildCompositeMap,
} from "../src/components/EntConstants.js";
import { buildGoEnumBlock } from "../src/components/ent-enum.js";
import { GO_TYPE_MAP } from "../src/components/EntConstants.js";

describe("escapeFormTagValue", () => {
  it("replaces backticks with single quotes", () => {
    expect(escapeFormTagValue("hello`world")).toBe("hello'world");
  });

  it("replaces commas with spaces", () => {
    expect(escapeFormTagValue("a,b,c")).toBe("a b c");
  });

  it("handles combined special characters", () => {
    expect(escapeFormTagValue("`val,ue`")).toBe("'val ue'");
  });

  it("returns unchanged string when no special chars", () => {
    expect(escapeFormTagValue("normal")).toBe("normal");
  });
});

describe("escapeComment", () => {
  it("replaces semicolons with commas", () => {
    expect(escapeComment("a;b;c")).toBe("a,b,c");
  });

  it("replaces double quotes with single quotes", () => {
    expect(escapeComment('say "hello"')).toBe("say 'hello'");
  });

  it("replaces backticks with single quotes", () => {
    expect(escapeComment("use `code`")).toBe("use 'code'");
  });

  it("handles all special characters together", () => {
    expect(escapeComment('`a`;"b"')).toBe("'a','b'");
  });
});

describe("goStringLiteral", () => {
  it("wraps simple string in double quotes", () => {
    expect(goStringLiteral("hello")).toBe('"hello"');
  });

  it("escapes newlines", () => {
    expect(goStringLiteral("line1\nline2")).toBe('"line1\\nline2"');
  });

  it("escapes double quotes", () => {
    expect(goStringLiteral('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("escapes backslashes", () => {
    expect(goStringLiteral("path\\to")).toBe('"path\\\\to"');
  });

  it("handles unicode characters", () => {
    expect(goStringLiteral("café")).toBe('"café"');
  });
});

describe("buildDocComment", () => {
  it("returns empty string for undefined", () => {
    expect(buildDocComment(undefined)).toBe("");
  });

  it("formats single-line comment with tab and newline", () => {
    expect(buildDocComment("User model")).toBe("\t// User model\n");
  });
});

describe("buildImportBlock", () => {
  it("returns empty string for no imports", () => {
    expect(buildImportBlock(new Set())).toBe("");
  });

  it("separates standard and external imports", () => {
    const result = buildImportBlock(new Set(["time", "github.com/google/uuid"]));
    expect(result).toContain('\t"time"');
    expect(result).toContain('\t"github.com/google/uuid"');
    expect(result.indexOf('"time"')).toBeLessThan(result.indexOf('"github.com/google/uuid"'));
  });

  it("sorts imports alphabetically", () => {
    const result = buildImportBlock(new Set(["time", "fmt"]));
    expect(result.indexOf('"fmt"')).toBeLessThan(result.indexOf('"time"'));
  });

  it("includes aliased package imports", () => {
    const result = buildImportBlock(new Set(), [{ alias: "models", path: "app/models" }]);
    expect(result).toContain('\tmodels "app/models"');
  });

  it("separates external and package imports with blank line", () => {
    const result = buildImportBlock(new Set(["github.com/google/uuid"]), [
      { alias: "m", path: "app/models" },
    ]);
    const lines = result.split("\n");
    const uuidIdx = lines.findIndex((l) => l.includes("uuid"));
    const aliasIdx = lines.findIndex((l) => l.includes("m "));
    expect(lines[uuidIdx + 1]).toBe("");
    expect(aliasIdx).toBeGreaterThan(uuidIdx);
  });
});

describe("buildCompositeMap", () => {
  it("returns empty map for undefined input", () => {
    expect(buildCompositeMap(undefined)).toEqual(new Map());
  });

  it("maps columns to their composite tags", () => {
    const result = buildCompositeMap([
      { name: "idx_user_email", columns: ["user_id", "email"], isUnique: false, isPrimary: false },
    ]);
    expect(result.get("user_id")).toEqual([{ kind: "index", name: "idx_user_email", priority: 1 }]);
    expect(result.get("email")).toEqual([{ kind: "index", name: "idx_user_email", priority: 2 }]);
  });

  it("uses uniqueIndex kind for unique composites", () => {
    const result = buildCompositeMap([
      { name: "uq_email", columns: ["email"], isUnique: true, isPrimary: false },
    ]);
    expect(result.get("email")![0].kind).toBe("uniqueIndex");
  });

  it("uses primaryIndex kind for primary composites", () => {
    const result = buildCompositeMap([
      { name: "pk_composite", columns: ["a", "b"], isUnique: false, isPrimary: true },
    ]);
    expect(result.get("a")![0].kind).toBe("primaryIndex");
  });

  it("accumulates multiple composites on the same column", () => {
    const result = buildCompositeMap([
      { name: "idx_a", columns: ["col"], isUnique: false, isPrimary: false },
      { name: "idx_b", columns: ["col"], isUnique: true, isPrimary: false },
    ]);
    expect(result.get("col")).toHaveLength(2);
    expect(result.get("col")![0].name).toBe("idx_a");
    expect(result.get("col")![1].name).toBe("idx_b");
  });
});

describe("buildGoEnumBlock", () => {
  it("generates type and const block for a single enum", () => {
    const enums = new Map([
      [
        "status",
        [
          { name: "active", value: "active" },
          { name: "inactive", value: "inactive" },
        ],
      ],
    ]);
    const lines = buildGoEnumBlock(enums);
    expect(lines).toContain("type Status string");
    expect(lines).toContain('\tStatusActive Status = "active"');
    expect(lines).toContain('\tStatusInactive Status = "inactive"');
    expect(lines).toContain("const (");
    expect(lines).toContain(")");
  });

  it("generates blocks for multiple enums", () => {
    const enums = new Map([
      ["role", [{ name: "admin", value: "admin" }]],
      ["status", [{ name: "active", value: "active" }]],
    ]);
    const lines = buildGoEnumBlock(enums);
    expect(lines).toContain("type Role string");
    expect(lines).toContain("type Status string");
  });

  it("returns empty array for empty map", () => {
    expect(buildGoEnumBlock(new Map())).toEqual([]);
  });
});

describe("GO_TYPE_MAP", () => {
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
      expect(GO_TYPE_MAP).toHaveProperty(key);
      expect(GO_TYPE_MAP[key].goType).toBeTruthy();
      expect(GO_TYPE_MAP[key].entType).toBeTruthy();
    }
  });

  it("includes imports for types that need them", () => {
    expect(GO_TYPE_MAP.uuid.imports).toContain("github.com/google/uuid");
    expect(GO_TYPE_MAP.utcDateTime.imports).toContain("time");
    expect(GO_TYPE_MAP.decimal.imports).toContain("github.com/shopspring/decimal");
    expect(GO_TYPE_MAP.jsonb.imports).toContain("encoding/json");
  });

  it("has no imports for primitive types", () => {
    expect(GO_TYPE_MAP.string.imports).toBeUndefined();
    expect(GO_TYPE_MAP.boolean.imports).toBeUndefined();
    expect(GO_TYPE_MAP.int32.imports).toBeUndefined();
  });
});
