/**
 * @qninhdt/typespec-dbml main emitter.
 */

import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext, Model } from "@typespec/compiler";
import {
  classifyProperties,
  collectManyToManyAssociations,
  getSchemaName,
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
import { renderAssociationTable, renderAssociationRefs } from "./components/DbmlAssociation.jsx";
import { quoteDbmlIdentifier } from "./components/DbmlConstants.js";
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

function buildSingleDocument(
  program: EmitContext<DbmlEmitterOptions>["program"],
  groupedTables: Map<string, ClassifiedTableEntry[]>,
  groupedAssociations: Map<string, ManyToManyAssociation[]>,
  projectName: string,
): string {
  const codeParts: string[] = [
    "// Database Schema",
    "",
    `Project ${quoteDbmlIdentifier(projectName)} {`,
    `  database_type: 'PostgreSQL'`,
    `}`,
    "",
  ];
  const allRefs = new Set<string>();

  // Hoist every enum referenced anywhere in the schema to a single top-of-file
  // pass, deduped by name. DBML rejects duplicate `Enum` blocks, so emitting
  // per-namespace would corrupt the single-file output when two namespaces
  // share an enum (e.g. `Demo.Shared.RoleKind`).
  const hoistedEnums = new Map<string, EnumMemberInfo[]>();
  for (const items of groupedTables.values()) {
    for (const { classified } of items) {
      for (const [name, members] of classified.enumTypes) {
        if (!hoistedEnums.has(name)) {
          hoistedEnums.set(name, members);
        }
      }
    }
  }
  const sortedEnumNames = [...hoistedEnums.keys()].sort((left, right) => left.localeCompare(right));
  for (const enumName of sortedEnumNames) {
    codeParts.push(generateEnumDefinition(enumName, hoistedEnums.get(enumName)!), "");
  }

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
      { emitEnums: false },
    );
    codeParts.push(...section, "");
  }

  // Emit one TableGroup per namespace alongside the existing comment headers so
  // dbdiagram.io applies visual grouping (otherwise the rendered diagram is
  // namespace-flat). Tables that synthesize many-to-many join tables are
  // included so the join table renders inside the same group as its
  // owning-side namespace.
  for (const [namespace, items] of sortedNamespaces) {
    const associations = groupedAssociations.get(namespace) ?? [];
    const tableNames: string[] = [];
    for (const entry of items) {
      tableNames.push(qualifiedTableForGroup(program, entry));
    }
    for (const association of associations) {
      tableNames.push(qualifiedAssociationForGroup(program, association));
    }
    if (tableNames.length === 0) continue;
    codeParts.push(`TableGroup ${quoteDbmlIdentifier(namespace)} {`);
    for (const name of tableNames) {
      codeParts.push(`  ${name}`);
    }
    codeParts.push("}", "");
  }

  for (const ref of [...allRefs].sort((left, right) => left.localeCompare(right))) {
    codeParts.push(ref);
  }

  return codeParts.join("\n");
}

function qualifiedTableForGroup(
  program: EmitContext<DbmlEmitterOptions>["program"],
  entry: ClassifiedTableEntry,
): string {
  const schema = getSchemaName(program, entry.model);
  const tablePart = quoteDbmlIdentifier(entry.tableName);
  return schema ? `${quoteDbmlIdentifier(schema)}.${tablePart}` : tablePart;
}

function qualifiedAssociationForGroup(
  program: EmitContext<DbmlEmitterOptions>["program"],
  association: ManyToManyAssociation,
): string {
  const joinSchema =
    getSchemaName(program, association.leftModel) ?? getSchemaName(program, association.rightModel);
  const tablePart = quoteDbmlIdentifier(association.tableName);
  return joinSchema ? `${quoteDbmlIdentifier(joinSchema)}.${tablePart}` : tablePart;
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
      // Each split file is a standalone DBML document — emit a Project header
      // so dbml2sql --postgres and dbdocs treat it as PostgreSQL, matching
      // single-file mode. The project name is derived from the namespace so
      // multiple split files do not collide on the same `Project` identifier.
      const codeParts = [
        "// Database Schema",
        "",
        `Project ${quoteDbmlIdentifier(namespace)} {`,
        `  database_type: 'PostgreSQL'`,
        `}`,
        "",
      ];
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
  options: { emitEnums?: boolean } = {},
): string[] {
  const emitEnums = options.emitEnums !== false;
  const codeParts: string[] = [`// Namespace: ${namespace}`, ""];
  const allEnums = new Map<string, EnumMemberInfo[]>();

  for (const { classified } of items) {
    for (const [name, members] of classified.enumTypes) {
      if (!allEnums.has(name)) {
        allEnums.set(name, members);
      }
    }
  }

  if (emitEnums) {
    for (const [enumName, members] of allEnums) {
      codeParts.push(generateEnumDefinition(enumName, members), "");
    }
  }

  for (const { model, tableName, classified } of items) {
    codeParts.push(DbmlTable({ program, model, tableName }), "");

    const relationRefs = generateRelationFields(
      program,
      classified.relations.filter(
        (relation) =>
          relation.resolved.kind === "many-to-one" || relation.resolved.kind === "one-to-one",
      ),
      model,
    );
    for (const ref of relationRefs) {
      refs.add(ref);
    }
  }

  for (const association of associations) {
    const tableDef = renderAssociationTable(program, association);
    if (tableDef === undefined) {
      // The association reported its own diagnostic and is unsafe to render;
      // skip its Refs as well to keep the doc parseable.
      continue;
    }
    codeParts.push(tableDef, "");
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
