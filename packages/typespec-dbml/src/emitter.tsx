/**
 * @qninhdt/typespec-dbml main emitter.
 */

import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import {
  classifyProperties,
  normalizeOrmGraph,
  selectModelsForEmitter,
} from "@qninhdt/typespec-orm";
import { DbmlTable } from "./components/DbmlTable.jsx";
import { generateEnumDefinition } from "./components/DbmlEnum.jsx";
import { generateRelationFields } from "./components/DbmlRelationField.jsx";
import type { DbmlEmitterOptions } from "./lib.js";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";

export async function emit(context: EmitContext<DbmlEmitterOptions>): Promise<void> {
  const program = context.program;
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const fileName = options.filename ?? "schema";

  const graph = normalizeOrmGraph(program);
  const selection = selectModelsForEmitter(program, graph, {
    include: options.include,
    exclude: options.exclude,
    kinds: ["table"],
  });
  const tables = selection.models;

  // Build the DBML content using array for better performance
  const codeParts: string[] = ["// Database Schema", ""];

  // Classify properties once per table and cache results
  const classifiedByTable = tables.map((table) => ({
    normalized: table,
    model: table.model,
    tableName: table.tableName!,
    classified: classifyProperties(program, table.model),
  }));

  const grouped = new Map<string, typeof classifiedByTable>();
  for (const table of classifiedByTable) {
    const bucket = grouped.get(table.normalized.namespace) ?? [];
    bucket.push(table);
    grouped.set(table.normalized.namespace, bucket);
  }

  const allRefs = new Set<string>();

  for (const [namespace, items] of [...grouped.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    codeParts.push(`// Namespace: ${namespace}`, "");

    const allEnums = new Map<string, EnumMemberInfo[]>();
    for (const { classified } of items) {
      for (const [name, members] of classified.enumTypes) {
        if (!allEnums.has(name)) {
          allEnums.set(name, members);
        }
      }
    }

    for (const [enumName, members] of allEnums) {
      codeParts.push(generateEnumDefinition(enumName, members), "");
    }

    for (const { model, tableName, classified } of items) {
      const tableDef = DbmlTable({ program, model, tableName });
      codeParts.push(tableDef, "");

      const refs = generateRelationFields(
        program,
        classified.relations.filter((r) => r.resolved.kind === "many-to-one"),
        tableName,
      );
      for (const ref of refs) {
        allRefs.add(ref);
      }
    }
  }

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
