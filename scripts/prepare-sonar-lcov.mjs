import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const packagesDir = "packages";
const packageNames = [
  "typespec-orm",
  "typespec-dbml",
  "typespec-gorm",
  "typespec-sqlmodel",
  "typespec-zod",
];

for (const packageName of packageNames) {
  const coverageDir = path.join(packagesDir, packageName, "coverage");
  const sourceFile = path.join(coverageDir, "lcov.info");
  const targetFile = path.join(coverageDir, "sonar-lcov.info");

  if (!existsSync(sourceFile)) {
    continue;
  }

  const packagePrefix = path.join(packagesDir, packageName).replaceAll(path.sep, "/");
  const contents = await readFile(sourceFile, "utf8");
  const rewritten = contents
    .split(/\r?\n/)
    .map((line) => {
      if (!line.startsWith("SF:")) {
        return line;
      }

      const filePath = line.slice(3);
      if (path.isAbsolute(filePath) || filePath.startsWith("packages/")) {
        return line;
      }

      return `SF:${packagePrefix}/${filePath.replaceAll(path.sep, "/")}`;
    })
    .join("\n");

  await mkdir(coverageDir, { recursive: true });
  await writeFile(targetFile, rewritten);
  console.log(`Prepared ${targetFile}`);
}
