/**
 * Generates the standalone package.json for emitted Zod schemas.
 *
 * Notes on the resulting shape:
 * - `private: true`, `version: "0.0.0"` — generated outputs are local
 *   monorepo libraries, never published to npm.
 * - `peerDependencies.zod` — consumers must use the same Zod runtime as
 *   the surrounding code so nominal `.brand(...)` types unify across
 *   module boundaries.
 * - `sideEffects: false` — the emitted code has no top-level side effects
 *   so bundlers can tree-shake unused schemas.
 * - `exports["./*"]` carries both `types` and `import` so subpath imports
 *   resolve at runtime, not just for the type checker.
 */
import type { NormalizedOrmModel } from "@qninhdt/typespec-orm";
import { ZOD_VERSION } from "../external-packages/zod.js";

export interface GeneratePackageJsonOptions {
  readonly libraryName: string;
  readonly models: readonly NormalizedOrmModel[];
  readonly description?: string;
  readonly license?: string;
}

/**
 * Build a `package.json` string with one subpath entry per emitted model
 * file. Subpaths use the on-disk layout (`namespaceDir/Model`) so consumers
 * can deep-import individual schemas without going through the barrel.
 */
export function generatePackageJson(options: GeneratePackageJsonOptions): string {
  const exports: Record<string, ExportEntry> = {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
  };

  for (const { model, namespaceDir } of options.models) {
    const subpath = namespaceDir ? `./${namespaceDir}/${model.name}` : `./${model.name}`;
    exports[subpath] = {
      types: `./dist${subpath.slice(1)}.d.ts`,
      import: `./dist${subpath.slice(1)}.js`,
    };
  }

  const pkg = {
    name: options.libraryName,
    version: "0.0.0",
    private: true,
    description: options.description ?? "Generated Zod schemas",
    license: options.license ?? "UNLICENSED",
    type: "module",
    sideEffects: false,
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports,
    // Bumped from `>=18` to `>=20` to match `target: ES2022` + NodeNext
    // module resolution. Node 18 reaches EOL April 2025; new generated
    // packages should not advertise support for it.
    engines: {
      node: ">=20",
    },
    scripts: {
      // Explicit `-p tsconfig.json` keeps the build self-describing in CI
      // logs. `clean` and `prebuild` give us a hermetic build by default
      // so partial outputs from a previous run can't leak into a new one.
      clean: "rm -rf dist",
      prebuild: "pnpm run clean",
      build: "tsc -p tsconfig.json",
      prepublishOnly: "pnpm run build",
    },
    peerDependencies: {
      zod: ZOD_VERSION,
    },
    devDependencies: {
      typescript: "^5.0.0",
      zod: ZOD_VERSION,
    },
  };

  return JSON.stringify(pkg, null, 2);
}

interface ExportEntry {
  readonly types: string;
  readonly import: string;
}
