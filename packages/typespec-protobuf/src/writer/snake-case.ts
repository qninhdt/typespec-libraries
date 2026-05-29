/**
 * Convert a TypeSpec property identifier (camelCase) to a proto field name
 * (snake_case). The algorithm matches the table documented in
 * `phase-03-emitter-core.md`:
 *
 * | Input         | Output         |
 * |---------------|----------------|
 * | `userId`      | `user_id`      |
 * | `userIDsHash` | `user_ids_hash`|
 * | `IPv4Address` | `ipv4_address` |
 * | `OAuth2Token` | `oauth2_token` |
 * | `httpURL`     | `http_url`     |
 * | `parseHTTP`   | `parse_http`   |
 * | `userAPI2`    | `user_api2`    |
 *
 * Rule: insert an underscore before an uppercase letter when the previous
 * character is lowercase or a digit. Consecutive uppercase letters stay in a
 * single segment (acronym run); trailing lowercase letters attach to the
 * preceding segment (e.g. `IDs` stays one segment because the boundary is
 * triggered by the next lower→upper transition, not by `s`).
 *
 * Deviations:
 * - All-uppercase identifiers stay all-lowercase as a single segment
 *   (`URL` → `url`). Authors who want `u_r_l` would use `@rename`.
 * - Names starting with an underscore or digit are returned with the
 *   underscore preserved (proto3 forbids leading digits — caller validates).
 */
export function camelToProtoSnake(input: string): string {
  if (input.length === 0) return input;

  const out: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (i > 0 && isUpper(ch)) {
      const prev = input[i - 1]!;
      if (isLower(prev) || isDigit(prev)) {
        out.push("_");
      }
    }
    out.push(ch);
  }
  return out.join("").toLowerCase();
}

function isUpper(ch: string): boolean {
  return ch >= "A" && ch <= "Z";
}

function isLower(ch: string): boolean {
  return ch >= "a" && ch <= "z";
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
