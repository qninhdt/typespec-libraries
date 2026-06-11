/**
 * DbmlDocument - Build the DBML document strings emitted by typespec-dbml.
 *
 * Contains the single-file and split-by-namespace document builders along with
 * their shared section/group helpers. The emitter wires graph data through
 * here to produce the final `.dbml` text written to disk.
 */

import type { Model, Program } from "@typespec/compiler";
import {
  classifyProperties,
  generatedHeader,
  getSchemaName,
  type EnumMemberInfo,
  type ManyToManyAssociation,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { DbmlTable } from "./DbmlTable.jsx";
import { generateEnumDefinition } from "./DbmlEnum.jsx";
import { generateRelationFields } from "./DbmlRelationField.jsx";
import { renderAssociationTable, renderAssociationRefs } from "./DbmlAssociation.jsx";
import { quoteDbmlIdentifier } from "./DbmlConstants.js";

export interface ClassifiedTableEntry {
  normalized: NormalizedOrmModel;
  model: Model;
  tableName: string;
  classified: ReturnType<typeof classifyProperties>;
}

export interface DbmlDocument {
  dir: string;
  fileName: string;
  code: string;
}

export function buildSingleDocument(
  program: Program,
  groupedTables: Map<string, ClassifiedTableEntry[]>,
  groupedAssociations: Map<string, ManyToManyAssociation[]>,
  projectName: string,
): string {
  const codeParts: string[] = [
    `// ${generatedHeader}`,
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

export function buildNamespaceDocuments(
  program: Program,
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
        `// ${generatedHeader}`,
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
  program: Program,
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

function qualifiedTableForGroup(program: Program, entry: ClassifiedTableEntry): string {
  const schema = getSchemaName(program, entry.model);
  const tablePart = quoteDbmlIdentifier(entry.tableName);
  return schema ? `${quoteDbmlIdentifier(schema)}.${tablePart}` : tablePart;
}

function qualifiedAssociationForGroup(
  program: Program,
  association: ManyToManyAssociation,
): string {
  const joinSchema =
    getSchemaName(program, association.leftModel) ?? getSchemaName(program, association.rightModel);
  const tablePart = quoteDbmlIdentifier(association.tableName);
  return joinSchema ? `${quoteDbmlIdentifier(joinSchema)}.${tablePart}` : tablePart;
}

function getSortedRefs(refs: Set<string>): string[] {
  return [...refs].sort((left, right) => left.localeCompare(right));
}
