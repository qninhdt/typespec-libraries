/**
 * @qninhdt/typespec-dbml main emitter.
 */

import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import {
  classifyProperties,
  collectManyToManyAssociations,
  normalizeOrmGraph,
  selectModelsForEmitter,
  type ManyToManyAssociation,
  type NormalizedOrmGraph,
} from "@qninhdt/typespec-orm";
import {
  buildNamespaceDocuments,
  buildSingleDocument,
  type ClassifiedTableEntry,
} from "./components/DbmlDocument.jsx";
import { reportDiagnostic, type DbmlEmitterOptions } from "./lib.js";

export async function emit(context: EmitContext<DbmlEmitterOptions>): Promise<void> {
  const program = context.program;
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const fileName = options.filename ?? "schema";
  const splitByNamespace = options["split-by-namespace"] ?? false;
  const projectName = options["project-name"] ?? "schema";

  const graph = normalizeOrmGraph(program);
  const selection = selectModelsForEmitter(program, graph, {
    include: options.include,
    exclude: options.exclude,
    autoIncludeDependencies: options["auto-include-dependencies"],
    kinds: ["table"],
  });
  const tables = selection.models;
  const associations = collectManyToManyAssociations(
    program,
    tables.map((item) => item.model),
  );

  const classifiedByTable = tables.map((table) => {
    if (table.tableName === undefined) {
      // Selection with kinds:["table"] guarantees a tableName, but be defensive.
      throw new Error(`Selected table model ${table.fullName} is missing a tableName.`);
    }
    return {
      normalized: table,
      model: table.model,
      tableName: table.tableName,
      classified: classifyProperties(program, table.model),
    };
  });

  const groupedTables = groupTablesByNamespace(classifiedByTable);
  const groupedAssociations = groupAssociationsByNamespace(graph, associations);

  const documents = splitByNamespace
    ? buildNamespaceDocuments(program, groupedTables, groupedAssociations)
    : [
        {
          dir: ".",
          fileName: `${fileName}.dbml`,
          code: buildSingleDocument(program, groupedTables, groupedAssociations, projectName),
        },
      ];

  const tree = (
    <SourceDirectory path=".">
      {documents.map((document) => (
        <SourceDirectory path={document.dir}>
          <SourceFile path={document.fileName} filetype="dbml" printWidth={9999}>
            {document.code}
          </SourceFile>
        </SourceDirectory>
      ))}
    </SourceDirectory>
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

function groupTablesByNamespace(
  items: ClassifiedTableEntry[],
): Map<string, ClassifiedTableEntry[]> {
  const grouped = new Map<string, ClassifiedTableEntry[]>();
  for (const item of items) {
    const bucket = grouped.get(item.normalized.namespace) ?? [];
    bucket.push(item);
    grouped.set(item.normalized.namespace, bucket);
  }
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.normalized.fullName.localeCompare(b.normalized.fullName));
  }
  return grouped;
}

function groupAssociationsByNamespace(
  graph: NormalizedOrmGraph,
  associations: ManyToManyAssociation[],
): Map<string, ManyToManyAssociation[]> {
  const grouped = new Map<string, ManyToManyAssociation[]>();
  for (const association of associations) {
    const namespace = graph.byModel.get(association.leftModel)?.namespace;
    if (!namespace) {
      continue;
    }
    const bucket = grouped.get(namespace) ?? [];
    bucket.push(association);
    grouped.set(namespace, bucket);
  }
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.tableName.localeCompare(b.tableName));
  }
  return grouped;
}
