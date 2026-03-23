/**
 * Main Zod emitter - generates Zod schemas from TypeSpec types.
 */

import { render, writeOutput, SourceDirectory, SourceFile } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { Output } from "@typespec/emitter-framework";
import { collectDataModels } from "@qninhdt/typespec-orm";
import { zod } from "./external-packages/zod.js";
import { ZodModelFile } from "./components/ZodModelFile.js";
import { toPascalCase } from "./utils.js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ZodEmitterOptions } from "./lib.js";

export async function $onEmit(context: EmitContext<ZodEmitterOptions>) {
  const outputDir = context.emitterOutputDir;
  const options = context.options;
  const isStandalone = options.standalone ?? false;
  const packageName = options["package-name"];

  // Validate standalone options
  if (isStandalone && !packageName) {
    context.program.reportDiagnostics([
      {
        code: "standalone-requires-package-name",
        severity: "error",
        message: "standalone mode requires 'package-name' option",
        target: context.program.getGlobalNamespaceType(),
      },
    ]);
    return;
  }

  // Collect data models (models decorated with @data)
  const dataModels = collectDataModels(context.program);

  if (dataModels.length === 0) {
    return;
  }

  // Determine output structure based on standalone mode
  const modelsPath = isStandalone ? "src/models" : ".";
  const modelDir = join(outputDir, modelsPath);

  // Build JSX component tree with each model in a separate file
  const tree = (
    <Output program={context.program} externals={[zod]}>
      <SourceDirectory path=".">
        {isStandalone && (
          <>
            <SourceFile path="package.json" filetype="json" printWidth={9999}>
              {JSON.stringify(
                {
                  name: packageName,
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
            <SourceFile path=".npmrc" filetype="text" printWidth={9999}>
              ignore-scripts=true
            </SourceFile>
            <SourceDirectory path="src">
              <SourceDirectory path="models">
                {dataModels.map(({ model, label }) => (
                  <ZodModelFile
                    program={context.program}
                    model={model}
                    label={label}
                    modelsFolder={true}
                  />
                ))}
              </SourceDirectory>
              <SourceFile path="index.ts" filetype="typescript" printWidth={9999}>
                {dataModels
                  .map(({ model }) => {
                    const name = model.name!;
                    return `export * from "./models/${name}.js";`;
                  })
                  .join("\n")}
              </SourceFile>
            </SourceDirectory>
          </>
        )}
        {!isStandalone &&
          dataModels.map(({ model, label }) => (
            <ZodModelFile program={context.program} model={model} label={label} />
          ))}
      </SourceDirectory>
    </Output>
  );

  const output = render(tree);
  await writeOutput(output, outputDir);

  // Add type aliases to each file
  for (const { model } of dataModels) {
    const name = model.name!;
    const pascalName = toPascalCase(name);
    const schemaName = pascalName + "Schema";
    const typeName = pascalName;

    const filePath = join(modelDir, `${name}.ts`);
    if (!existsSync(filePath)) continue;

    let fileContent = readFileSync(filePath, "utf-8");

    // Append type alias at the end of the file
    fileContent =
      fileContent.trim() + `\nexport type ${typeName} = z.infer<typeof ${schemaName}>;\n`;

    writeFileSync(filePath, fileContent);
  }

  // Create package.json for non-standalone mode
  if (!isStandalone) {
    const packageJson = {
      name: "ts-zod",
      version: "0.0.0",
      type: "module",
      dependencies: {
        zod: "^3.23.0",
      },
    };

    writeFileSync(join(outputDir, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");
  }
}
