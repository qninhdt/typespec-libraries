import { describe, expect, it } from "vitest";
import { renderProtoComment } from "../../src/writer/proto-comment.js";

describe("renderProtoComment", () => {
  it("returns empty array for undefined / empty input", () => {
    expect(renderProtoComment(undefined)).toEqual([]);
    expect(renderProtoComment("")).toEqual([]);
  });

  it("renders a single short line", () => {
    expect(renderProtoComment("hello world")).toEqual(["// hello world"]);
  });

  it("preserves multi-line layout from doc comments", () => {
    expect(renderProtoComment("first\nsecond\nthird")).toEqual([
      "// first",
      "// second",
      "// third",
    ]);
  });

  it("escapes @-prefixed tokens with backticks", () => {
    expect(renderProtoComment("uses @deprecated and @foo")).toEqual([
      "// uses `@deprecated` and `@foo`",
    ]);
  });

  it("does not double-escape already-fenced tokens", () => {
    // @deprecated already inside backticks should stay unchanged.
    const result = renderProtoComment("see `@deprecated` token");
    expect(result).toEqual(["// see `@deprecated` token"]);
  });

  it("indents lines when indent is supplied", () => {
    expect(renderProtoComment("foo", { indent: "  " })).toEqual(["  // foo"]);
  });

  it("wraps long lines on word boundaries", () => {
    const long = "This is a long sentence that should wrap because it exceeds the column budget.";
    const wrapped = renderProtoComment(long, { maxColumns: 40 });
    expect(wrapped.length).toBeGreaterThan(1);
    for (const line of wrapped) {
      expect(line.length).toBeLessThanOrEqual(40);
      expect(line.startsWith("// ")).toBe(true);
    }
  });

  it("emits empty `//` for blank lines in the middle", () => {
    expect(renderProtoComment("first\n\nsecond")).toEqual(["// first", "//", "// second"]);
  });

  it("strips trailing blank lines", () => {
    expect(renderProtoComment("only\n\n\n")).toEqual(["// only"]);
  });

  it("preserves embedded double-quotes (proto comments are not string-quoted)", () => {
    expect(renderProtoComment('he said "hello"')).toEqual(['// he said "hello"']);
  });
});
