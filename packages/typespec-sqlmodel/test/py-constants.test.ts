import { describe, expect, it } from "vitest";
import {
  pythonStringLiteral,
  pythonTripleQuotedString,
  serializeColumnKwargs,
  promoteFieldArgsToColumn,
  getNativePydanticType,
  getPythonTypeMap,
  PYTHON_TYPE_MAP,
  UNKNOWN_PY_TYPE,
} from "../src/components/PyConstants.js";
import {
  groupImports,
  buildPythonImportBlock,
  toPythonRelativeImport,
} from "../src/components/py-imports.js";

describe("pythonStringLiteral", () => {
  it("wraps simple string in double quotes", () => {
    expect(pythonStringLiteral("hello")).toBe('"hello"');
  });

  it("escapes newlines", () => {
    expect(pythonStringLiteral("a\nb")).toBe('"a\\nb"');
  });

  it("escapes double quotes", () => {
    expect(pythonStringLiteral('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("escapes backslashes", () => {
    expect(pythonStringLiteral("a\\b")).toBe('"a\\\\b"');
  });
});

describe("pythonTripleQuotedString", () => {
  it("wraps value in triple quotes", () => {
    expect(pythonTripleQuotedString("hello")).toBe('"""hello"""');
  });

  it("escapes triple quotes in content", () => {
    expect(pythonTripleQuotedString('has """inside"""')).toBe('"""has \\"\\"\\"inside\\"\\"\\""""');
  });

  it("escapes backslashes", () => {
    expect(pythonTripleQuotedString("path\\to")).toBe('"""path\\\\to"""');
  });

  it("preserves newlines", () => {
    expect(pythonTripleQuotedString("line1\nline2")).toBe('"""line1\nline2"""');
  });
});

describe("serializeColumnKwargs", () => {
  it("converts bare flags to True", () => {
    expect(serializeColumnKwargs(["index"])).toBe('{"index": True}');
  });

  it("preserves key=value pairs", () => {
    expect(serializeColumnKwargs(["ondelete=CASCADE"])).toBe('{"ondelete": CASCADE}');
  });

  it("handles multiple args", () => {
    const result = serializeColumnKwargs(["index", "unique=True"]);
    expect(result).toBe('{"index": True, "unique": True}');
  });
});

describe("promoteFieldArgsToColumn", () => {
  it("promotes index=True to columnArgs", () => {
    const columnArgs: string[] = [];
    const saImports = new Set<string>();
    const result = promoteFieldArgsToColumn(["index=True"], columnArgs, saImports);
    expect(result).toEqual([]);
    expect(columnArgs).toContain("index=True");
  });

  it("promotes unique=True to columnArgs", () => {
    const columnArgs: string[] = [];
    const saImports = new Set<string>();
    const result = promoteFieldArgsToColumn(["unique=True"], columnArgs, saImports);
    expect(result).toEqual([]);
    expect(columnArgs).toContain("unique=True");
  });

  it("promotes foreign_key to ForeignKey in columnArgs and adds import", () => {
    const columnArgs: string[] = [];
    const saImports = new Set<string>();
    const result = promoteFieldArgsToColumn(['foreign_key="users.id"'], columnArgs, saImports);
    expect(result).toEqual([]);
    expect(columnArgs[0]).toBe('ForeignKey("users.id")');
    expect(saImports.has("sqlalchemy.ForeignKey")).toBe(true);
  });

  it("moves nullable to columnArgs and drops server_default", () => {
    const columnArgs: string[] = [];
    const saImports = new Set<string>();
    const result = promoteFieldArgsToColumn(
      ["nullable=True", "server_default=func.now()"],
      columnArgs,
      saImports,
    );
    expect(result).toEqual([]);
    expect(columnArgs).toEqual(["nullable=True"]);
  });

  it("keeps unrecognized args in filtered output", () => {
    const columnArgs: string[] = [];
    const saImports = new Set<string>();
    const result = promoteFieldArgsToColumn(["max_length=255"], columnArgs, saImports);
    expect(result).toEqual(["max_length=255"]);
  });
});

describe("getNativePydanticType", () => {
  it("returns EmailStr for email scalar", () => {
    expect(getNativePydanticType("email")).toBe("EmailStr");
  });

  it("returns AnyUrl for url scalar", () => {
    expect(getNativePydanticType("url")).toBe("AnyUrl");
  });

  it("returns IPv4Address for ipv4 scalar", () => {
    expect(getNativePydanticType("ipv4")).toBe("IPv4Address");
  });

  it("returns undefined for unknown scalar", () => {
    expect(getNativePydanticType("phone")).toBeUndefined();
  });
});

describe("getPythonTypeMap", () => {
  it("returns mapping for known types", () => {
    const result = getPythonTypeMap("uuid");
    expect(result.pyType).toBe("UUID");
    expect(result.imports).toContain("uuid.UUID");
  });

  it("returns UNKNOWN_PY_TYPE for unknown types", () => {
    expect(getPythonTypeMap("nonexistent")).toBe(UNKNOWN_PY_TYPE);
    expect(getPythonTypeMap("nonexistent").pyType).toBe("Any");
  });

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
      expect(PYTHON_TYPE_MAP).toHaveProperty(key);
      expect(PYTHON_TYPE_MAP[key].pyType).toBeTruthy();
    }
  });
});

describe("groupImports", () => {
  it("groups dotted imports by module", () => {
    const result = groupImports(new Set(["uuid.UUID", "uuid.uuid4"]));
    expect(result.get("uuid")).toEqual(new Set(["UUID", "uuid4"]));
  });

  it("handles aliased imports", () => {
    const result = groupImports(new Set(["sqlalchemy.Column as SAColumn"]));
    expect(result.get("sqlalchemy")).toEqual(new Set(["Column as SAColumn"]));
  });

  it("handles TYPE_CHECKING as typing import", () => {
    const result = groupImports(new Set(["TYPE_CHECKING"]));
    expect(result.get("typing")).toEqual(new Set(["TYPE_CHECKING"]));
  });

  it("handles bare module names", () => {
    const result = groupImports(new Set(["os"]));
    expect(result.get("os")).toEqual(new Set(["os"]));
  });
});

describe("buildPythonImportBlock", () => {
  it("generates sorted import statements", () => {
    const result = buildPythonImportBlock(
      new Set(["uuid.UUID", "datetime.datetime"]),
      new Set(["sqlalchemy.String"]),
      new Set(["Field", "SQLModel"]),
      "sqlmodel",
    );
    expect(result).toContain("from datetime import datetime");
    expect(result).toContain("from uuid import UUID");
    expect(result).toContain("from sqlalchemy import String");
    expect(result).toContain("from sqlmodel import Field, SQLModel");
  });

  it("separates std imports from sa imports with blank line", () => {
    const result = buildPythonImportBlock(
      new Set(["uuid.UUID"]),
      new Set(["sqlalchemy.String"]),
      new Set(["SQLModel"]),
      "sqlmodel",
    );
    const lines = result.split("\n");
    const uuidLine = lines.findIndex((l) => l.includes("uuid"));
    const saLine = lines.findIndex((l) => l.includes("sqlalchemy"));
    expect(lines[uuidLine + 1]).toBe("");
    expect(saLine).toBeGreaterThan(uuidLine);
  });

  it("uses pydantic as import source when specified", () => {
    const result = buildPythonImportBlock(new Set(), new Set(), new Set(["BaseModel"]), "pydantic");
    expect(result).toContain("from pydantic import BaseModel");
  });

  it("deduplicates imports from same module", () => {
    const result = buildPythonImportBlock(
      new Set(["typing.Optional", "typing.List"]),
      new Set(),
      new Set(["SQLModel"]),
      "sqlmodel",
    );
    expect(result).toContain("from typing import List, Optional");
    const typingLines = result.split("\n").filter((l) => l.includes("from typing"));
    expect(typingLines).toHaveLength(1);
  });
});

describe("toPythonRelativeImport", () => {
  it("builds imports for sibling namespaces", () => {
    expect(toPythonRelativeImport(["accounts"], ["worlds"], "world")).toBe("..worlds.world");
  });

  it("builds imports for nested child namespaces", () => {
    expect(toPythonRelativeImport(["content"], ["content", "places"], "location")).toBe(
      ".places.location",
    );
  });
});
