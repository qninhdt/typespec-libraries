/**
 * @qninhdt/typespec-dbml main emitter.
 */

import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext, Model } from "@typespec/compiler";
import {
  classifyProperties,
  collectManyToManyAssociations,
  normalizeOrmGraph,
  selectModelsForEmitter,
  type EnumMemberInfo,
  type ManyToManyAssociation,
  type NormalizedOrmGraph,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { DbmlTable } from "./components/DbmlTable.jsx";
import { generateEnumDefinition } from "./components/DbmlEnum.jsx";
import { generateRelationFields } from "./components/DbmlRelationField.jsx";
import {
  renderAssociationTable,
  renderAssociationRefs,
} from "./components/DbmlAssociation.jsx";
import { reportDiagnostic, type DbmlEmitterOptions } from "./lib.js";

interface ClassifiedTableEntry {
  normalized: NormalizedOrmModel;
  model: Model;
  tableName: string;
  classified: ReturnType<typeof classifyProperties>;
}

interface DbmlDocument {
  dir: string;
  fileName: string;
  code: string;
}

export async function emit(context: EmitContext<DbmlEmitterOptions>): Promise<void> {
  const program = context.program;
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const fileName = options.filename ?? "schema";
  const splitByNamespace = options["split-by-namespace"] ?? false;

  const graph = normalizeOrmGraph(program);
  const selection = selectModelsForEmitter(program, graph, {
    include: options.include,
    exclude: options.exclude,
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
          code: buildSingleDocument(program, groupedTables, groupedAssociations),
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

function buildSingleDocument(
  program: EmitContext<DbmlEmitterOptions>["program"],
  groupedTables: Map<string, ClassifiedTableEntry[]>,
  groupedAssociations: Map<string, ManyToManyAssociation[]>,
): string {
  const codeParts: string[] = ["// Database Schema", ""];
  const allRefs = new Set<string>();

  const sortedNamespaces = [...groupedTables.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [namespace, items] of sortedNamespaces) {
    const section = renderNamespaceSection(
      program,
      namespace,
      items,
      groupedAssociations.get(namespace) ?? [],
      allRefs,
    );
    codeParts.push(...section, "");
  }

  for (const ref of [...allRefs].sort((left, right) => left.localeCompare(right))) {
    codeParts.push(ref);
  }

  return codeParts.join("\n");
}

function buildNamespaceDocuments(
  program: EmitContext<DbmlEmitterOptions>["program"],
  groupedTables: Map<string, ClassifiedTableEntry[]>,
  groupedAssociations: Map<string, ManyToManyAssociation[]>,
): DbmlDocument[] {
  return [...groupedTables.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([namespace, items]) => {
      const refs = new Set<string>();
      const codeParts = ["// Database Schema", ""];
      codeParts.push(
        ...renderNamespaceSection(
          program,
          namespace,
          items,
          groupedAssociations.get(namespace) ?? [],
          refs,
        ),
      );

      if (refs.size > 0) {
        codeParts.push("", ...getSortedRefs(refs));
      }

      const namespacePath = items[0].normalized.namespacePath;
      return {
        dir: namespacePath.slice(0, -1).join("/") || ".",
        fileName: `${namespacePath.at(-1)!}.dbml`,
        code: codeParts.join("\n"),
      };
    });
}

function renderNamespaceSection(
  program: EmitContext<DbmlEmitterOptions>["program"],
  namespace: string,
  items: ClassifiedTableEntry[],
  associations: ManyToManyAssociation[],
  refs: Set<string>,
): string[] {
  const codeParts: string[] = [`// Namespace: ${namespace}`, ""];
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
    codeParts.push(DbmlTable({ program, model, tableName }), "");

    const relationRefs = generateRelationFields(
      program,
      classified.relations.filter(
        (relation) =>
          relation.resolved.kind === "many-to-one" || relation.resolved.kind === "one-to-one",
      ),
      tableName,
    );
    for (const ref of relationRefs) {
      refs.add(ref);
    }
  }

  for (const association of associations) {
    codeParts.push(renderAssociationTable(program, association), "");
    for (const ref of renderAssociationRefs(program, association)) {
      refs.add(ref);
    }
  }

  return codeParts;
}

function getSortedRefs(refs: Set<string>): string[] {
  return [...refs].sort((left, right) => left.localeCompare(right));
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
