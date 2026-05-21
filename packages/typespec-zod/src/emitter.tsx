import { render, writeOutput, SourceDirectory, SourceFile } from "@alloy-js/core";
import { type EmitContext } from "@typespec/compiler";
import { Output } from "@typespec/emitter-framework";
import { bootstrapEmitter, isBootstrapSuccess } from "@qninhdt/typespec-orm";
import { zod } from "./external-packages/zod.js";
import { ZodModelFile } from "./components/ZodModelFile.js";
import { collectScalarsForModels, ZodScalarsFile } from "./components/ZodScalarsFile.js";
import { reportDiagnostic, type ZodEmitterOptions } from "./lib.js";

export async function $onEmit(context: EmitContext<ZodEmitterOptions>) {
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const isStandalone = options.standalone ?? false;
  const libraryName = options["library-name"];

  const result = bootstrapEmitter(context, {
    kinds: ["mixin", "data"],
    include: options.include,
    exclude: options.exclude,
    standalone: options.standalone,
    libraryName,
  });

  if (!isBootstrapSuccess(result)) {
    if (result.reason === "standalone-requires-library-name") {
      reportDiagnostic(context.program, {
        code: "standalone-requires-library-name",
        target: context.program.getGlobalNamespaceType(),
      });
    }
    return;
  }

  const { selection, namespaceGroups } = result;
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
                  scripts: {
                    build: "tsc",
                  },
                  dependencies: {
                    zod: "^4.4.3",
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
          <ZodScalarsFile
            program={context.program}
            scalars={collectScalarsForModels(
              context.program,
              selection.models.map((model) => model.model),
            )}
          />
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
  try {
    await writeOutput(output, outputDir);
  } catch (e) {
    reportDiagnostic(context.program, {
      code: "emit-write-failed",
      target: context.program.getGlobalNamespaceType(),
      format: { message: e instanceof Error ? e.message : String(e) },
    });
  }
}
