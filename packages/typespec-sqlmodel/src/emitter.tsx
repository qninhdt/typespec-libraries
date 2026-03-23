/**
 * TypeSpec emitter that generates SQLModel (Python) classes from
 * models decorated with @table and @data decorators.
 */
import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { collectTableModels, collectDataModels, camelToSnake } from "@qninhdt/typespec-orm";
import { reportDiagnostic, type SqlModelEmitterOptions } from "./lib.js";
import { PyModelFile } from "./components/PyModel.jsx";
import { PyDataFile } from "./components/PyDataModel.jsx";
import { generateInit } from "./components/PyConstants.js";

export async function emit(context: EmitContext<SqlModelEmitterOptions>): Promise<void> {
  const { program } = context;
  const outputDir = context.emitterOutputDir;
  const options = context.options;
  const isStandalone = options.standalone ?? false;
  const packageName = options["package-name"];
  const moduleName = options["module-name"] ?? "models";

  // Validate standalone options
  if (isStandalone && !packageName) {
    reportDiagnostic(program, {
      code: "standalone-requires-package-name",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  const tables = collectTableModels(program);
  const dataModels = collectDataModels(program);

  if (tables.length === 0 && dataModels.length === 0) {
    reportDiagnostic(program, {
      code: "no-tables-found",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  // Collect model names and files for __init__.py generation
  const allModelNames: string[] = [];
  const moduleFiles: string[] = [];

  for (const { model } of [...tables, ...dataModels]) {
    allModelNames.push(model.name);
    moduleFiles.push(camelToSnake(model.name));
  }

  // Determine output structure based on standalone mode
  const modelsFolder = isStandalone ? "models" : ".";

  // Generate __init__.py content
  const initContent = generateInit(allModelNames, moduleFiles, moduleName);

  // Build JSX component tree
  const tree = (
    <SourceDirectory path=".">
      {isStandalone && (
        <>
          <SourceFile path="pyproject.toml" filetype="toml" printWidth={9999}>
            {`[project]
name = "${packageName}"
version = "0.0.0"
description = "Generated SQLModel classes"
requires-python = ">=3.10"
dependencies = [
    "sqlmodel>=0.0.14",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["` +
              modelsFolder +
              `"]
`}
          </SourceFile>
          <SourceDirectory path={modelsFolder}>
            {tables.map(({ model, tableName }) => (
              <PyModelFile program={program} model={model} tableName={tableName} />
            ))}
            {dataModels.map(({ model, label }) => (
              <PyDataFile program={program} model={model} label={label} />
            ))}
            <SourceFile path="__init__.py" filetype="py" printWidth={9999}>
              {initContent}
            </SourceFile>
          </SourceDirectory>
        </>
      )}
      {!isStandalone && (
        <>
          {tables.map(({ model, tableName }) => (
            <PyModelFile program={program} model={model} tableName={tableName} />
          ))}
          {dataModels.map(({ model, label }) => (
            <PyDataFile program={program} model={model} label={label} />
          ))}
          <SourceFile path="__init__.py" filetype="py" printWidth={9999}>
            {initContent}
          </SourceFile>
        </>
      )}
    </SourceDirectory>
  );

  const output = render(tree);
  await writeOutput(output, outputDir);
}
