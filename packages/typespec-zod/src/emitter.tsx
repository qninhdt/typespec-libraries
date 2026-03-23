/**
 * Main Zod emitter - generates namespace-grouped Zod schemas from TypeSpec data models.
 */

import { render, writeOutput, SourceDirectory, SourceFile } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { Output } from "@typespec/emitter-framework";
import { normalizeOrmGraph, selectModelsForEmitter } from "@qninhdt/typespec-orm";
import { zod } from "./external-packages/zod.js";
import { ZodModelFile } from "./components/ZodModelFile.js";
import { reportDiagnostic, type ZodEmitterOptions } from "./lib.js";

export async function $onEmit(context: EmitContext<ZodEmitterOptions>) {
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const isStandalone = options.standalone ?? false;
  const libraryName = options["library-name"];

  if (isStandalone && !libraryName) {
    reportDiagnostic(context.program, {
      code: "standalone-requires-library-name",
      target: context.program.getGlobalNamespaceType(),
    });
    return;
  }

  const graph = normalizeOrmGraph(context.program);
  const selection = selectModelsForEmitter(context.program, graph, {
    include: options.include,
    exclude: options.exclude,
    kinds: ["data"],
  });

  if (selection.models.length === 0) {
    return;
  }

  const namespaceGroups = [...selection.byNamespace.values()].sort((a, b) =>
    a[0].namespace.localeCompare(b[0].namespace),
  );
  const basePath = isStandalone ? "src" : ".";

  const tree = (
    <Output program={context.program} externals={[zod]}>
      <SourceDirectory path=".">
        {isStandalone && (
          <>
            <SourceFile path="package.json" filetype="json" printWidth={9999}>
              {JSON.stringify(
                {
                  name: libraryName,
                  version: "0.0.0",
                  private: true,
                  type: "module",
                  main: "./dist/index.js",
                  types: "./dist/index.d.ts",
                  exports: {
                    ".": {
                      import: "./dist/index.js",
                      types: "./dist/index.d.ts",
                    },
                    "./*": {
                      types: "./dist/*.d.ts",
                    },
                  },
                  dependencies: {
                    zod: "^3.23.0",
                  },
                  devDependencies: {
                    typescript: "^5.0.0",
                  },
                },
                null,
                2,
              )}
            </SourceFile>
            <SourceFile path="tsconfig.json" filetype="json" printWidth={9999}>
              {JSON.stringify(
                {
                  compilerOptions: {
                    target: "ES2022",
                    module: "NodeNext",
                    moduleResolution: "NodeNext",
                    lib: ["ES2022"],
                    outDir: "./dist",
                    rootDir: "./src",
                    declaration: true,
                    emitDeclarationOnly: true,
                    esModuleInterop: true,
                    strict: true,
                    skipLibCheck: true,
                  },
                  include: ["src/**/*.ts"],
                  exclude: ["node_modules", "dist"],
                },
                null,
                2,
              )}
            </SourceFile>
          </>
        )}
        <SourceDirectory path={basePath}>
          {namespaceGroups.map((models) => (
            <SourceDirectory path={models[0].namespaceDir}>
              {models.map((model) => (
                <ZodModelFile
                  program={context.program}
                  model={model.model}
                  label={model.label ?? model.name}
                  path={`${model.model.name}.ts`}
                />
              ))}
            </SourceDirectory>
          ))}
          <SourceFile path="index.ts" filetype="typescript" printWidth={9999}>
            {selection.models
              .map((model) => `export * from "./${model.namespaceDir}/${model.model.name}.js";`)
              .join("\n")}
          </SourceFile>
        </SourceDirectory>
      </SourceDirectory>
    </Output>
  );

  const output = render(tree);
  await writeOutput(output, outputDir);
}
