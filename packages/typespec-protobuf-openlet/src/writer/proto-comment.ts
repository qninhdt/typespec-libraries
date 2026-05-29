/**
 * Render a TypeSpec doc-comment string as a proto-safe block of `//` lines.
 *
 * Behavior:
 * - Splits on existing newlines so multi-line `@doc(""" ... """)` blocks
 *   keep their layout.
 * - Word-wraps each line at the given column budget (default 100) without
 *   breaking inside a single token.
 * - Leaves embedded double-quotes alone — `.proto` line comments are not
 *   string-quoted, so escaping isn't required and would corrupt the source.
 * - Backtick-escapes any `@word` token (e.g. `@deprecated` → `` `@deprecated` ``)
 *   so the comment can safely contain other emitter directives without being
 *   misread as a doc-tool annotation.
 * - Trims trailing whitespace and drops trailing blank lines.
 *
 * Returns an array of line strings, each ALREADY prefixed with `// ` (or `//`
 * for blank-content lines). Callers concatenate with `\n`.
 */
export function renderProtoComment(
  doc: string | undefined,
  opts: { indent?: string; maxColumns?: number; escape?: boolean } = {},
): string[] {
  if (!doc) return [];
  const indent = opts.indent ?? "";
  const maxColumns = opts.maxColumns ?? 100;
  const escape = opts.escape ?? true;
  const prefix = `${indent}// `;
  const contentBudget = Math.max(20, maxColumns - prefix.length);

  const lines: string[] = [];
  for (const rawLine of doc.split(/\r?\n/)) {
    const escaped = (escape ? escapeAtWords(rawLine) : rawLine).trimEnd();
    if (escaped === "") {
      lines.push(`${indent}//`);
      continue;
    }
    for (const wrapped of wrapLine(escaped, contentBudget)) {
      lines.push(`${prefix}${wrapped}`);
    }
  }

  while (lines.length > 0 && lines[lines.length - 1] === `${indent}//`) {
    lines.pop();
  }
  return lines;
}

/**
 * Wrap `@word` tokens in backticks so doc-tool prefixes inside a TypeSpec
 * doc don't get mistaken for emitter directives in the rendered proto. Only
 * touches tokens that look like `@`+identifier; bare `@` characters survive.
 */
function escapeAtWords(line: string): string {
  return line.replace(/(^|[^`A-Za-z0-9_])@([A-Za-z_][A-Za-z0-9_]*)/g, "$1`@$2`");
}

function wrapLine(line: string, budget: number): string[] {
  if (line.length <= budget) return [line];
  const out: string[] = [];
  const words = line.split(/(\s+)/);
  let current = "";
  for (const tok of words) {
    if (tok === "") continue;
    if (current.length + tok.length > budget && current.trim().length > 0) {
      out.push(current.trimEnd());
      current = tok.trimStart();
    } else {
      current += tok;
    }
  }
  if (current.trim().length > 0) out.push(current.trimEnd());
  return out.length === 0 ? [line] : out;
}
