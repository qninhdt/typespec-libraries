export function getLibraryLeafName(libraryName: string): string {
  const trimmed = libraryName.trim();
  const segments = trimmed.split("/");
  let leaf = trimmed;
  for (let index = segments.length - 1; index >= 0; index--) {
    if (segments[index]) {
      leaf = segments[index];
      break;
    }
  }
  return leaf.replaceAll(/[^\w]/g, "_");
}

export function getRelativeImportPath(
  fromSegments: string[],
  toSegments: string[],
  leaf: string,
): string {
  let common = 0;
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    fromSegments[common] === toSegments[common]
  ) {
    common++;
  }

  const up = fromSegments.length - common;
  const down = toSegments.slice(common);
  const parts = [...new Array(up).fill(".."), ...down, leaf].filter(Boolean);
  if (parts.length === 0) {
    return ".";
  }
  if (parts[0] !== "..") {
    return `./${parts.join("/")}`;
  }
  return parts.join("/");
}
