import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { $onEmit } from "../src/emitter.js";
import { createEmitterTestRunner, emitZodFile } from "./utils.jsx";

const SAMPLE = `
model Wallet {
  balance: int64;
}
`;

async function emitWithStrategy(strategy: "bigint" | "string" | "number" | undefined) {
  const runner = await createEmitterTestRunner(
    strategy === undefined ? undefined : { "int64-strategy": strategy },
  );
  await runner.compile(SAMPLE);
  const outDir = await mkdtemp(join(tmpdir(), `zod-int64-${strategy ?? "default"}-`));
  await $onEmit({
    program: runner.program,
    options: strategy === undefined ? {} : { "int64-strategy": strategy },
    emitterOutputDir: outDir,
  } as never);
  // Find the emitted Wallet.ts file recursively.
  const findFile = async (dir: string): Promise<string | undefined> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const hit = await findFile(full);
        if (hit) return hit;
      } else if (entry.name === "Wallet.ts") {
        return full;
      }
    }
    return undefined;
  };
  const file = await findFile(outDir);
  expect(file, "Wallet.ts not found in emitter output").toBeDefined();
  return readFile(file!, "utf8");
}

describe("Zod int64-strategy option", () => {
  it("defaults to 'string' (z.string().regex(/^-?\\d+$/))", async () => {
    const output = await emitZodFile(SAMPLE, "Wallet.ts");
    expect(output).toContain("balance: z.string().regex(/^-?\\d+$/)");
    expect(output).not.toContain("z.bigint()");
  });

  it("emits z.bigint() when strategy is 'bigint'", async () => {
    const output = await emitWithStrategy("bigint");
    expect(output).toContain("balance: z.bigint()");
    expect(output).not.toContain("z.string().regex");
  });

  it("emits z.string().regex(/^-?\\d+$/) when strategy is 'string'", async () => {
    const output = await emitWithStrategy("string");
    expect(output).toContain("balance: z.string().regex(/^-?\\d+$/)");
    expect(output).not.toContain("z.bigint()");
  });

  it("emits z.number().int() when strategy is 'number'", async () => {
    const output = await emitWithStrategy("number");
    expect(output).toContain("balance: z.number().int()");
    expect(output).not.toContain("z.bigint()");
    expect(output).not.toContain("z.string().regex");
  });

  it("renders int64 default literal as JSON string under default 'string' strategy", async () => {
    const output = await emitZodFile(
      `
      model Account {
        total: int64 = 42;
      }
    `,
      "Account.ts",
    );
    expect(output).toContain('.default("42")');
    expect(output).not.toContain(".default(42n)");
  });

  it("renders int64 default literal as bigint under 'bigint' strategy", async () => {
    const runner = await createEmitterTestRunner({ "int64-strategy": "bigint" });
    await runner.compile(`
      model Account {
        total: int64 = 42;
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "zod-int64-bigint-default-"));
    await $onEmit({
      program: runner.program,
      options: { "int64-strategy": "bigint" },
      emitterOutputDir: outDir,
    } as never);
    const findFile = async (dir: string): Promise<string | undefined> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          const hit = await findFile(full);
          if (hit) return hit;
        } else if (entry.name === "Account.ts") {
          return full;
        }
      }
      return undefined;
    };
    const file = await findFile(outDir);
    expect(file).toBeDefined();
    const output = await readFile(file!, "utf8");
    expect(output).toContain(".default(42n)");
  });
});
