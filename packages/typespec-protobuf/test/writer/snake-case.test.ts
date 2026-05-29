import { describe, expect, it } from "vitest";
import { camelToProtoSnake } from "../../src/writer/snake-case.js";

describe("camelToProtoSnake", () => {
  it.each([
    ["userId", "user_id"],
    ["userIDsHash", "user_ids_hash"],
    ["IPv4Address", "ipv4_address"],
    ["OAuth2Token", "oauth2_token"],
    ["httpURL", "http_url"],
    ["parseHTTP", "parse_http"],
    ["userAPI2", "user_api2"],
  ] as const)("converts %s → %s", (input, expected) => {
    expect(camelToProtoSnake(input)).toBe(expected);
  });

  it.each([
    ["", ""],
    ["a", "a"],
    ["A", "a"],
    ["ABC", "abc"],
    ["abc", "abc"],
    ["aBc", "a_bc"],
    ["snake_case", "snake_case"],
    ["already_snake", "already_snake"],
  ] as const)("edge case: %s → %s", (input, expected) => {
    expect(camelToProtoSnake(input)).toBe(expected);
  });

  it("preserves leading underscores", () => {
    expect(camelToProtoSnake("_internal")).toBe("_internal");
  });
});
