/**
 * @qninhdt/typespec-gorm
 *
 * TypeSpec emitter that generates GORM (Go) model structs from
 * models decorated with @table and related decorators from @qninhdt/typespec-orm.
 *
 * Uses JSX components with @alloy-js/core for code generation,
 * following the same pattern as typespec-zod.
 */

import { render, writeOutput, SourceDirectory } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { collectTableModels, collectDataModels } from "@qninhdt/typespec-orm";
import { reportDiagnostic, type GormEmitterOptions } from "./lib.js";
import { GormModelFile } from "./components/GormStruct.jsx";
import { GormDataFile } from "./components/GormDataStruct.jsx";

// ─── Emitter entry point ─────────────────────────────────────────────────────

export async function emit(context: EmitContext<GormEmitterOptions>): Promise<void> {
  const { program } = context;
  const outputDir = context.emitterOutputDir;
  const packageName = context.options["package-name"] ?? "models";

  const tables = collectTableModels(program);
  const dataModels = collectDataModels(program);

  if (tables.length === 0 && dataModels.length === 0) {
    reportDiagnostic(program, {
      code: "no-tables-found",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  // Build JSX component tree and render to output files
  const tree = (
    <SourceDirectory path=".">
      {tables.map(({ model, tableName }) => (
        <GormModelFile
          program={program}
          model={model}
          tableName={tableName}
          packageName={packageName}
        />
      ))}
      {dataModels.map(({ model, label }) => (
        <GormDataFile program={program} model={model} label={label} packageName={packageName} />
      ))}
    </SourceDirectory>
  );

  const output = render(tree);
  await writeOutput(output, outputDir);
}
