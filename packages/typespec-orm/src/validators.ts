/**
 * Model-level validation pass for @qninhdt/typespec-orm.
 *
 * Exported as `$onValidate` from the library entry point so the TypeSpec
 * compiler calls it after all decorators have been applied.
 */

import type { Program } from "@typespec/compiler";
import { collectTableModels } from "./helpers.js";
import { normalizeOrmGraph } from "./normalization.js";
import { validateDuplicateTableNames, validateModel } from "./validators-model.js";
import {
  validateCascadeOnScalar,
  validateForeignKeyIndex,
  validateRelations,
  validateManyToMany,
} from "./validators-relations.js";
import {
  validatePgReservedIdentifiers,
  validatePolymorphicProperties,
  validateGoTypeAndIndexUsing,
} from "./validators-misc.js";

export function $onValidate(program: Program): void {
  const tableModels = collectTableModels(program);

  validateDuplicateTableNames(program, tableModels);

  for (const { model } of tableModels) {
    validateModel(program, model);
  }

  validateCascadeOnScalar(program, tableModels);
  validateForeignKeyIndex(program, tableModels);
  validateRelations(program, tableModels);
  validateManyToMany(program, tableModels);
  validatePgReservedIdentifiers(program, tableModels);
  validatePolymorphicProperties(program, tableModels);
  validateGoTypeAndIndexUsing(program, tableModels);

  normalizeOrmGraph(program);
}
