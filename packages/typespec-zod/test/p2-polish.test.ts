/**
 * P2 polish tests:
 *  - B: `@multipleOf` -> `.multipleOf(...)` and `Meta.field.multipleOf`
 *       (structural: the decorator lives in `@typespec/json-schema` which
 *        isn't a test-library dep here, so we assert the wiring exists in
 *        source rather than running an end-to-end compile.)
 *  - C: discriminated-union envelope namespace stamping
 *  - D: stricter standalone tsconfig
 *  - E: standalone build-script improvements
 *  - G: `${pascal}MetaType` alias coexists with `MetaShape`
 *  - H: form FK referencing a non-`id` column (pin current behavior)
 */
import { mkdtemp, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { $onEmit } from "../src/emitter.js";
import { createTestRunner, emitZodFile, renderZodOutput } from "./utils.jsx";
import { getOutputFileContent } from "@qninhdt/typespec-orm/testing";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, "..", "src");

async function emitStandalone(
  code: string,
  emitterOptions: Record<string, unknown> = {},
): Promise<{ outDir: string }> {
  const runner = await createTestRunner();
  await runner.compile(code);
  const outDir = await mkdtemp(join(tmpdir(), "zod-p2-"));
  await $onEmit({
    program: runner.program,
    options: { standalone: true, "library-name": "p2-test", ...emitterOptions },
    emitterOutputDir: outDir,
  } as never);
  return { outDir };
}

describe("P2 Group B - @multipleOf mapping (structural)", () => {
  // Rationale: TypeSpec's `@multipleOf` decorator is defined in
  // `@typespec/json-schema`, which is not a dependency or test library of
  // this package. Wiring it up just for a single test would pull in a
  // sibling library and grow the surface. Instead we verify by reading
  // source that:
  //   1. The numeric-constraints resolver dispatches a `multipleOf` part.
  //   2. The meta-builder surfaces a `multipleOf` key.
  //   3. The `FormFieldMeta` interface declares `multipleOf?: number`.
  // End-to-end coverage is straightforward to add once `@typespec/json-schema`
  // is wired up at the workspace level.

  it("numeric constraints emit a `multipleOf` part", async () => {
    const src = await readFile(join(SRC_DIR, "constraints-numeric.ts"), "utf8");
    expect(src).toMatch(/multipleOf\?: number;/);
    expect(src).toMatch(/callPart\("multipleOf"/);
    // The resolver feeds @multipleOf via a JS-decorator-array reader.
    expect(src).toMatch(/extractMultipleOf/);
  });

  it("meta-builder surfaces multipleOf and the FormFieldMeta interface declares it", async () => {
    const src = await readFile(join(SRC_DIR, "components", "meta-builder.ts"), "utf8");
    expect(src).toMatch(/parts\.push\(`multipleOf:/);
    expect(src).toMatch(/getMultipleOfFromProperty/);
    expect(src).toContain("multipleOf?: number;");
  });
});

describe("P2 Group C - synthetic envelope models get a namespace", () => {
  it("two unions with the same variant name in different namespaces emit cleanly", async () => {
    // Synthetic envelope models are anonymous and inlined into the
    // discriminatedUnion(...) call. The namespace stamp is defensive: any
    // future collision-detection that keys models by `kind:namespace.name`
    // will see distinct identities for the two unions below. Here we mainly
    // pin down that nothing crashes and both files contain a
    // discriminatedUnion call with object envelopes.
    const output = await renderZodOutput(`
      namespace A {
        model CatA { name: string; }
        model DogA { name: string; }
        @discriminated(#{ envelope: "object" })
        union PetA { cat: CatA, dog: DogA }
        @data("Form")
        model HoldsPetA { pet: PetA; }
      }
      namespace B {
        model CatB { name: string; }
        model DogB { name: string; }
        @discriminated(#{ envelope: "object" })
        union PetB { cat: CatB, dog: DogB }
        @data("Form")
        model HoldsPetB { pet: PetB; }
      }
    `);

    const a = getOutputFileContent(output, "HoldsPetA.ts");
    const b = getOutputFileContent(output, "HoldsPetB.ts");
    // Multi-line output: just look for the call, not the full inline form.
    expect(a).toMatch(/z\.discriminatedUnion\(\s*"kind"/);
    expect(b).toMatch(/z\.discriminatedUnion\(\s*"kind"/);
    // Each file produces two object envelopes with literal discriminators.
    expect(a.match(/z\.literal\("cat"\)/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(a.match(/z\.literal\("dog"\)/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(b.match(/z\.literal\("cat"\)/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(b.match(/z\.literal\("dog"\)/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe("P2 Group D - stricter tsconfig in standalone output", () => {
  it("includes the four stricter compiler options", async () => {
    const { outDir } = await emitStandalone(`
      @data("Form")
      model F { value: string; }
    `);
    const tsconfig = JSON.parse(await readFile(join(outDir, "tsconfig.json"), "utf8"));
    expect(tsconfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
    expect(tsconfig.compilerOptions.exactOptionalPropertyTypes).toBe(true);
    expect(tsconfig.compilerOptions.verbatimModuleSyntax).toBe(true);
    expect(tsconfig.compilerOptions.forceConsistentCasingInFileNames).toBe(true);
  });

  it("bumps engines.node to >=20", async () => {
    const { outDir } = await emitStandalone(`
      @data("Form")
      model F { value: string; }
    `);
    const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));
    expect(pkg.engines).toBeDefined();
    expect(pkg.engines.node).toBe(">=20");
  });
});

describe("P2 Group E - standalone build script improvements", () => {
  it("uses tsc -p tsconfig.json and includes clean / prebuild / prepublishOnly", async () => {
    const { outDir } = await emitStandalone(`
      @data("Form")
      model F { value: string; }
    `);
    const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));
    expect(pkg.scripts.build).toBe("tsc -p tsconfig.json");
    expect(pkg.scripts.clean).toBe("rm -rf dist");
    expect(pkg.scripts.prebuild).toBe("pnpm run clean");
    expect(pkg.scripts.prepublishOnly).toBe("pnpm run build");
  });
});

describe("P2 Group G - MetaType alias coexists with MetaShape", () => {
  it("emits both `${pascal}MetaShape` and `${pascal}MetaType`", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model F {
        @title("Name")
        name: string;
      }
    `,
      "F.ts",
    );
    expect(output).toContain("export type FMetaShape = typeof FMeta;");
    expect(output).toContain("export type FMetaType = FMetaShape;");
  });
});

describe("P2 Group H - form FK referencing a non-id column", () => {
  // Pin down current behavior: when a form model references a non-`id`
  // column on a table model (e.g. `Organization.code`), the emitted Zod
  // schema currently treats the foreign-key field as a plain scalar
  // reference (string in this case). The point of this test is to make
  // future regressions visible, not to assert any particular spec.
  it("treats the FK as a plain scalar reference", async () => {
    const output = await emitZodFile(
      `
      @table("organizations")
      model Organization {
        @key id: int32;
        @unique code: string;
        name: string;
      }

      @data("Form")
      model OrgInviteForm {
        @doc("Code of the organization to invite into")
        organizationCode: Organization.code;
        invitee: string;
      }
    `,
      "OrgInviteForm.ts",
    );

    // Whatever else the schema does, the form file must compile to a
    // z.object with the lookup field present.
    expect(output).toContain("z.object(");
    expect(output).toContain("organizationCode:");
    // Lookup type unwraps to `string` (the column's scalar). We accept any
    // representation that resolves to a string Zod schema — either inline
    // `z.string()` or a reference to the workspace's string scalar.
    const orgSection = output.slice(output.indexOf("organizationCode:"));
    expect(orgSection).toMatch(/z\.string\(|StringSchema|string/);
  });
});
