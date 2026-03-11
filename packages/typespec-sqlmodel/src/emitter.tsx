/**
 * @qninhdt/typespec-sqlmodel
 *
 * TypeSpec emitter that generates SQLModel (Python) classes from
 * models decorated with @table and related decorators from @qninhdt/typespec-orm.
 *
 * Uses JSX components with @alloy-js/core for code generation,
 * following the same pattern as typespec-zod.
 */

import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { collectTableModels, collectDataModels, camelToSnake } from "@qninhdt/typespec-orm";
import { reportDiagnostic, type SqlModelEmitterOptions } from "./lib.js";
import { PyModelFile } from "./components/PyModel.jsx";
import { PyDataFile } from "./components/PyDataModel.jsx";
import { generateInit } from "./components/PyConstants.js";

// ─── Emitter entry point ─────────────────────────────────────────────────────

export async function emit(context: EmitContext<SqlModelEmitterOptions>): Promise<void> {
  const { program } = context;
  const outputDir = context.emitterOutputDir;
  const moduleName = context.options["module-name"] ?? "models";

  const tables = collectTableModels(program);
  const dataModels = collectDataModels(program);

  if (tables.length === 0 && dataModels.length === 0) {
    reportDiagnostic(program, {
      code: "no-tables-found",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  // Track model names for __init__.py generation
  const allModelNames: string[] = [];
  const moduleFiles: string[] = [];

  for (const { model } of tables) {
    allModelNames.push(model.name);
    moduleFiles.push(camelToSnake(model.name));
  }
  for (const { model } of dataModels) {
    allModelNames.push(model.name);
    moduleFiles.push(camelToSnake(model.name));
  }

  // Generate __init__.py content
  const initContent = generateInit(allModelNames, moduleFiles, moduleName);

  // Build JSX component tree
  const tree = (
    <SourceDirectory path=".">
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
  );

  const output = render(tree);
  await writeOutput(output, outputDir);
}
