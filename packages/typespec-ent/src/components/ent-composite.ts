export interface CompositeFieldTag {
  kind: "index" | "uniqueIndex" | "primaryIndex";
  name: string;
  priority: number;
}

export function buildCompositeMap(
  compositeTypes?: { name: string; columns: string[]; isUnique: boolean; isPrimary: boolean }[],
): Map<string, CompositeFieldTag[]> {
  const map = new Map<string, CompositeFieldTag[]>();

  if (!compositeTypes) return map;

  for (const ct of compositeTypes) {
    let kind: CompositeFieldTag["kind"] = "index";
    if (ct.isPrimary) {
      kind = "primaryIndex";
    } else if (ct.isUnique) {
      kind = "uniqueIndex";
    }

    for (let i = 0; i < ct.columns.length; i++) {
      const column = ct.columns[i];
      const tags = map.get(column) ?? [];
      tags.push({ kind, name: ct.name, priority: i + 1 });
      map.set(column, tags);
    }
  }

  return map;
}
