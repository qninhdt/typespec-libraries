/**
 * PyModelBuilder — collects all the per-file state needed to render a
 * SQLModel class. Replaces the loose set of 10 mutable Sets/arrays/flag
 * objects that used to live as locals inside `PyModelFile`.
 *
 * The builder owns:
 *   - import sets (std / sa / sqlmodel)
 *   - field/column "needs Field()/Column()" flags
 *   - generated field definitions (regular + relation)
 *   - tracked relation target models for the TYPE_CHECKING block
 *
 * Ordering of operations is preserved — callers still drive the order via
 * `addIgnored / addRelations / addRegular` (see PyModel.tsx).
 */

import type { Model } from "@typespec/compiler";

export class PyModelBuilder {
  readonly stdImports = new Set<string>();
  readonly saImports = new Set<string>();
  readonly sqlmodelImports: Set<string>;
  readonly needsField = { value: false };
  readonly needsColumn = { value: false };
  readonly fieldDefs: string[] = [];
  readonly relationDefs: string[] = [];
  readonly relationTargetModels = new Set<Model>();

  constructor(initialSqlmodelImports: Iterable<string> = ["SQLModel", "Field"]) {
    this.sqlmodelImports = new Set<string>(initialSqlmodelImports);
  }

  addFieldDef(code: string): void {
    if (code) this.fieldDefs.push(code);
  }

  addRelationDef(code: string, target: Model): void {
    this.relationDefs.push(code);
    this.relationTargetModels.add(target);
  }

  ensureSqlmodel(name: string): void {
    this.sqlmodelImports.add(name);
  }

  ensureStdImport(name: string): void {
    this.stdImports.add(name);
  }
}
