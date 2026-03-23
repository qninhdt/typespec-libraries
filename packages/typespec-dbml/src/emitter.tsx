/**
 * @qninhdt/typespec-dbml main emitter.
 */

import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { collectTableModels, classifyProperties } from "@qninhdt/typespec-orm";
import { DbmlTable } from "./components/DbmlTable.jsx";
import { generateEnumDefinition } from "./components/DbmlEnum.jsx";
import { generateRelationFields } from "./components/DbmlRelationField.jsx";
import type { DbmlEmitterOptions } from "./lib.js";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";

export async function emit(context: EmitContext<DbmlEmitterOptions>): Promise<void> {
  const program = context.program;
  const options = context.options;
  const outputDir = context.emitterOutputDir;
  const fileName = options.filename ?? "schema";

  // Collect all @table models
  const tables = collectTableModels(program);

  // Build the DBML content using array for better performance
  const codeParts: string[] = ["// Database Schema", ""];

  // Classify properties once per table and cache results
  const classifiedByTable = tables.map(({ model, tableName }) => ({
    model,
    tableName,
    classified: classifyProperties(program, model),
  }));

  // Collect all enums used across all tables
  const allEnums = new Map<string, EnumMemberInfo[]>();
  for (const { classified } of classifiedByTable) {
    for (const [name, members] of classified.enumTypes) {
      if (!allEnums.has(name)) {
        allEnums.set(name, members);
      }
    }
  }

  // Add enum definitions
  for (const [enumName, members] of allEnums) {
    codeParts.push(generateEnumDefinition(enumName, members), "");
  }

  // Add table definitions and collect all references (deduplicated)
  const allRefs = new Set<string>();
  for (const { model, tableName, classified } of classifiedByTable) {
    const tableDef = DbmlTable({ program, model, tableName });
    codeParts.push(tableDef, "");

    // Collect references - only many-to-one (FK is on this table)
    const refs = generateRelationFields(
      program,
      classified.relations.filter((r) => r.resolved.kind === "many-to-one"),
      tableName,
    );
    for (const ref of refs) {
      allRefs.add(ref);
    }
  }

  // Add references at the end (deduplicated)
  for (const ref of allRefs) {
    codeParts.push(ref);
  }

  const code = codeParts.join("\n");

  // Write single file
  const tree = (
    <SourceDirectory path=".">
      <SourceFile path={`${fileName}.dbml`} filetype="dbml" printWidth={9999}>
        {code}
      </SourceFile>
    </SourceDirectory>
  );

  // Render and write output
  const output = render(tree);
  await writeOutput(output, outputDir);
}
