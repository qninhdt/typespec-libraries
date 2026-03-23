import { describe, expect, it } from "vitest";
import { camelToSnake, camelToPascal, deriveTableName } from "@qninhdt/typespec-orm";

describe("camelToSnake", () => {
  it("converts simple camelCase", () => {
    expect(camelToSnake("userId")).toBe("user_id");
  });

  it("converts PascalCase", () => {
    expect(camelToSnake("StoryNode")).toBe("story_node");
  });

  it("handles consecutive uppercase letters", () => {
    expect(camelToSnake("HTMLParser")).toBe("html_parser");
  });

  it("handles single word lowercase", () => {
    expect(camelToSnake("name")).toBe("name");
  });

  it("handles single letter words", () => {
    expect(camelToSnake("x")).toBe("x");
  });

  it("handles already snake_case", () => {
    expect(camelToSnake("user_id")).toBe("user_id");
  });
});

describe("camelToPascal", () => {
  it("converts camelCase to PascalCase", () => {
    // The function treats 'Id' as an acronym -> 'UserID'
    expect(camelToPascal("userId")).toBe("UserID");
  });

  it("keeps PascalCase with acronym", () => {
    expect(camelToPascal("UserId")).toBe("UserID");
  });

  it("handles single char", () => {
    expect(camelToPascal("a")).toBe("A");
  });

  it("converts simple camelCase", () => {
    expect(camelToPascal("userName")).toBe("UserName");
  });
});

describe("deriveTableName", () => {
  it("pluralizes simple name", () => {
    expect(deriveTableName("User")).toBe("users");
  });

  it("pluralizes PascalCase name", () => {
    expect(deriveTableName("StoryNode")).toBe("story_nodes");
  });

  it("pluralizes -y with consonant before it to -ies", () => {
    expect(deriveTableName("Category")).toBe("categories");
  });

  it("pluralizes -y with vowel before it by adding -s", () => {
    expect(deriveTableName("Day")).toBe("days");
  });

  it("pluralizes -s ending by adding -es", () => {
    expect(deriveTableName("Address")).toBe("addresses");
  });

  it("pluralizes -x ending by adding -es", () => {
    expect(deriveTableName("Box")).toBe("boxes");
  });

  it("pluralizes -sh ending by adding -es", () => {
    expect(deriveTableName("Wish")).toBe("wishes");
  });

  it("pluralizes -ch ending by adding -es", () => {
    expect(deriveTableName("Match")).toBe("matches");
  });
});
