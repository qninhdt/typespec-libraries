export function escapeFormTagValue(value: string): string {
  return value.replaceAll("`", "'").replaceAll(",", " ");
}

export function escapeComment(doc: string): string {
  return doc.replaceAll(";", ",").replaceAll('"', "'").replaceAll("`", "'");
}

export function goStringLiteral(value: string): string {
  return JSON.stringify(value);
}

export function buildDocComment(doc: string | undefined): string {
  return doc ? `\t// ${doc}\n` : "";
}
