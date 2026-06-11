/**
 * Naming utilities for converting between TypeSpec identifier conventions
 * (camelCase / PascalCase) and database / Go conventions (snake_case, plural
 * table names, capitalised initialisms).
 */

/** Convert camelCase to snake_case */
export function camelToSnake(name: string): string {
  if (name.length === 0) {
    return name;
  }

  let result = "";

  for (let index = 0; index < name.length; index++) {
    const current = name[index];
    const previous = index > 0 ? name[index - 1] : undefined;
    const next = index + 1 < name.length ? name[index + 1] : undefined;
    const isUpper = current >= "A" && current <= "Z";
    const previousIsLowerOrDigit =
      previous !== undefined &&
      ((previous >= "a" && previous <= "z") || (previous >= "0" && previous <= "9"));
    const previousIsUpper = previous !== undefined && previous >= "A" && previous <= "Z";
    const nextIsLower = next !== undefined && next >= "a" && next <= "z";

    if (isUpper && index > 0 && (previousIsLowerOrDigit || (previousIsUpper && nextIsLower))) {
      result += "_";
    }

    result += current.toLowerCase();
  }

  return result;
}

/** Pre-compiled Go abbreviation replacement patterns (avoids per-call RegExp construction) */
function escapeRegExpLiteral(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GO_ABBREVIATION_RULES: { endPattern: RegExp; midPattern: RegExp; to: string }[] = [
  ["Id", "ID"],
  ["Ids", "IDs"],
  ["Url", "URL"],
  ["Urls", "URLs"],
  ["Uri", "URI"],
  ["Uris", "URIs"],
  ["Http", "HTTP"],
  ["Https", "HTTPS"],
  ["Api", "API"],
  ["Uuid", "UUID"],
  ["Sql", "SQL"],
  ["Ip", "IP"],
  ["Tcp", "TCP"],
  ["Udp", "UDP"],
  ["Ssh", "SSH"],
  ["Cpu", "CPU"],
  ["Json", "JSON"],
].map(([from, to]) => ({
  endPattern: new RegExp(`${escapeRegExpLiteral(from)}$`),
  midPattern: new RegExp(`${escapeRegExpLiteral(from)}(?=[A-Z])`, "g"),
  to,
}));

/** Convert camelCase to PascalCase with Go abbreviation rules */
export function camelToPascal(name: string): string {
  let result = name.charAt(0).toUpperCase() + name.slice(1);

  for (const { endPattern, midPattern, to } of GO_ABBREVIATION_RULES) {
    result = result.replace(endPattern, to);
    result = result.replace(midPattern, to);
  }

  return result;
}

/** Derive table name from model name: PascalCase -> snake_case plural */
export function deriveTableName(modelName: string): string {
  const snake = camelToSnake(modelName);
  if (snake.endsWith("sh") || snake.endsWith("ch")) return snake + "es";
  if (snake.endsWith("s") || snake.endsWith("x")) return snake + "es";
  if (snake.endsWith("z")) {
    const beforeZ = snake.at(-2) ?? "";
    if (/[aeiou]/.test(beforeZ)) return snake + "zes";
    return snake + "es";
  }
  // Only convert trailing -y to -ies when preceded by a consonant
  if (snake.endsWith("y") && snake.length > 1 && !/[aeiou]/.test(snake.at(-2) ?? "")) {
    return snake.slice(0, -1) + "ies";
  }
  return snake + "s";
}
