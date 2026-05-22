import { render, writeOutput, SourceDirectory, SourceFile } from "@alloy-js/core";
import { type EmitContext } from "@typespec/compiler";
import { Output } from "@typespec/emitter-framework";
import { bootstrapEmitter, isBootstrapSuccess } from "@qninhdt/typespec-orm";
import { zod, ZOD_VERSION } from "./external-packages/zod.js";
import { ZodModelFile } from "./components/ZodModelFile.js";
import { collectScalarsForModels, ZodScalarsFile } from "./components/ZodScalarsFile.js";
import { ZodMetaFile } from "./components/ZodMetaFile.js";
import { reportDiagnostic, type ZodEmitterOptions } from "./lib.js";
import { generatePackageJson } from "./emitter/package-json.js";
import { generateRootBarrel } from "./emitter/root-barrel.js";

export async function $onEmit(context: EmitContext<ZodEmitterOptions>) {
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const isStandalone = options.standalone ?? false;
  const libraryName = options["library-name"];

  const result = bootstrapEmitter(context, {
    kinds: ["mixin", "data"],
    include: options.include,
    exclude: options.exclude,
    autoIncludeDependencies: options["auto-include-dependencies"],
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
  const scalars = collectScalarsForModels(
    context.program,
    selection.models.map((model) => model.model),
  );
  const hasScalarsFile = scalars.length > 0;
  const rootBarrelSource = generateRootBarrel(selection.models, hasScalarsFile);

  const tree = (
    <Output program={context.program} externals={[zod]}>
      <SourceDirectory path=".">
        {isStandalone && (
          <>
            <SourceFile path="package.json" filetype="json" printWidth={9999}>
              {generatePackageJson({
                libraryName: libraryName!,
                models: selection.models,
                description: options.description,
                license: options.license,
              })}
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
                    // Stricter defaults: align generated packages with the
                    // safety knobs we expect in the workspace itself.
                    noUncheckedIndexedAccess: true,
                    exactOptionalPropertyTypes: true,
                    verbatimModuleSyntax: true,
                    forceConsistentCasingInFileNames: true,
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
          <ZodMetaFile />
          <ZodScalarsFile program={context.program} scalars={scalars} />
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
            {rootBarrelSource}
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

// Re-export ZOD_VERSION so it remains tree-shakable for users importing
// the emitter package directly. Not part of the public API contract.
export { ZOD_VERSION };
