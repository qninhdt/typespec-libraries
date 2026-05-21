import { describe, expect, it } from "vitest";
import { toPascalCase } from "../src/utils.jsx";

describe("toPascalCase", () => {
  it("converts kebab-case", () => {
    expect(toPascalCase("foo-bar")).toBe("FooBar");
  });

  it("converts snake_case", () => {
    expect(toPascalCase("foo_bar")).toBe("FooBar");
  });

  it("capitalizes first letter of simple string", () => {
    expect(toPascalCase("already")).toBe("Already");
  });

  it("handles already PascalCase", () => {
    expect(toPascalCase("FooBar")).toBe("FooBar");
  });

  it("handles single character", () => {
    expect(toPascalCase("a")).toBe("A");
  });

  it("handles mixed separators", () => {
    expect(toPascalCase("foo-bar_baz")).toBe("FooBarBaz");
  });
});
