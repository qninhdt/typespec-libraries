/**
 * Model collectors that walk the program's namespace tree.
 *
 * Kept separate from `state-accessors.ts` so importing a single decorator
 * reader does not pull in the full namespace traversal.
 */

import type { Model, Namespace, Program } from "@typespec/compiler";

import { deriveTableName } from "./naming.js";
import { TableKey, TableMixinKey } from "./lib.js";
import { getTypeFullName, isOrmManagedModel } from "./state-accessors.js";

export interface TableModel {
  model: Model;
  tableName: string;
}

/** Collect all models decorated with @table from the program state. */
export function collectTableModels(program: Program): TableModel[] {
  const tables: TableModel[] = [];
  for (const [type, name] of program.stateMap(TableKey)) {
    if (type.kind === "Model") {
      const tableName = (name as string | undefined) || deriveTableName(type.name);
      const model = type;
      tables.push({ model, tableName });
    }
  }
  tables.sort((a, b) => a.tableName.localeCompare(b.tableName));
  return tables;
}

export function collectTableMixins(program: Program): Model[] {
  const mixins: Model[] = [];
  for (const [type] of program.stateMap(TableMixinKey)) {
    if (type.kind === "Model") {
      mixins.push(type);
    }
  }
  mixins.sort((a, b) => getTypeFullName(program, a).localeCompare(getTypeFullName(program, b)));
  return mixins;
}

export function collectOrmManagedModels(program: Program): Model[] {
  const models: Model[] = [];
  const visit = (namespace: Namespace) => {
    for (const model of namespace.models.values()) {
      if (isOrmManagedModel(program, model)) {
        models.push(model);
      }
    }
    for (const child of namespace.namespaces.values()) {
      visit(child);
    }
  };

  visit(program.getGlobalNamespaceType());
  return models.sort((a, b) =>
    getTypeFullName(program, a).localeCompare(getTypeFullName(program, b)),
  );
}
