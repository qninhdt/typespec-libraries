import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { $onEmit } from "../src/emitter.js";
import { ZOD_VERSION } from "../src/external-packages/zod.js";
import { createTestRunner } from "./utils.jsx";

async function emitStandalone(
  code: string,
  emitterOptions: Record<string, unknown> = {},
): Promise<{ outDir: string; runner: Awaited<ReturnType<typeof createTestRunner>> }> {
  const runner = await createTestRunner();
  await runner.compile(code);
  const outDir = await mkdtemp(join(tmpdir(), "zod-p1-"));
  await $onEmit({
    program: runner.program,
    options: { standalone: true, "library-name": "p1-test", ...emitterOptions },
    emitterOutputDir: outDir,
  } as never);
  return { outDir, runner };
}

describe("P1 Group A — generated package.json polish", () => {
  it("emits zod under peerDependencies (not dependencies) and pins via constant", async () => {
    const { outDir } = await emitStandalone(`
      namespace Demo {
        model F { value: string; }
      }
    `);
    const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));

    expect(pkg.peerDependencies).toBeDefined();
    expect(pkg.peerDependencies.zod).toBe(ZOD_VERSION);
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.devDependencies.zod).toBe(ZOD_VERSION);
  });

  it("sets sideEffects: false", async () => {
    const { outDir } = await emitStandalone(`
      model F { value: string; }
    `);
    const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));
    expect(pkg.sideEffects).toBe(false);
  });

  it("uses default description and UNLICENSED license when options not set", async () => {
    const { outDir } = await emitStandalone(`
      model F { value: string; }
    `);
    const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));
    expect(pkg.description).toBe("Generated Zod schemas");
    expect(pkg.license).toBe("UNLICENSED");
  });

  it("honors description and license overrides from emitter options", async () => {
    const { outDir } = await emitStandalone(
      `
      model F { value: string; }
    `,
      { description: "My custom schemas", license: "Apache-2.0" },
    );
    const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));
    expect(pkg.description).toBe("My custom schemas");
    expect(pkg.license).toBe("Apache-2.0");
  });

  it("adds import + types per subpath in exports map", async () => {
    const { outDir } = await emitStandalone(`
      namespace Demo.Forms {
        model RegisterForm { email: string; }
      }
    `);
    const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));

    const subpathKey = Object.keys(pkg.exports).find(
      (k) => k !== "." && k.endsWith("/RegisterForm"),
    )!;
    expect(subpathKey).toBeDefined();
    const entry = pkg.exports[subpathKey];
    expect(entry.types).toMatch(/RegisterForm\.d\.ts$/);
    expect(entry.import).toMatch(/RegisterForm\.js$/);
  });

  it("keeps version: '0.0.0' and private: true (not published)", async () => {
    const { outDir } = await emitStandalone(`
      model F { value: string; }
    `);
    const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));
    expect(pkg.version).toBe("0.0.0");
    expect(pkg.private).toBe(true);
  });
});
