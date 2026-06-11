import {
  walkPropertiesInherited,
  type Model,
  type ModelProperty,
  type Program,
} from "@typespec/compiler";
import { reportDiagnostic } from "./lib.js";
import {
  isTable,
  getColumnName,
  isKey,
  isUnique,
  isIndex,
  getIndexName,
  getUniqueName,
  isIgnored,
  getPolymorphicConfig,
  getGoType,
  getIndexUsing,
} from "./helpers.js";
import { isPgReservedWord } from "./identifier-policy.js";

// ─── PG reserved-word identifier check ──────────────────────────────────────

export function validatePgReservedIdentifiers(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  const reportedNames = new Set<string>();

  const reportOnce = (name: string, target: Model | ModelProperty, cacheKey: string): void => {
    if (!isPgReservedWord(name)) return;
    if (reportedNames.has(cacheKey)) return;
    reportedNames.add(cacheKey);
    reportDiagnostic(program, {
      code: "pg-reserved-identifier",
      target,
      format: { name },
    });
  };

  for (const { model, tableName } of tableModels) {
    reportOnce(tableName, model, `table:${tableName}`);

    for (const prop of walkPropertiesInherited(model)) {
      if (isIgnored(program, prop)) continue;

      const isRelationModel = prop.type.kind === "Model" && isTable(program, prop.type as Model);
      const isRelationArray =
        prop.type.kind === "Model" && (prop.type as Model).indexer?.value?.kind === "Model";
      const isRelation = isRelationModel || isRelationArray;

      if (!isRelation) {
        const colName = getColumnName(program, prop);
        reportOnce(colName, prop, `col:${tableName}.${colName}`);
      }

      if (!isRelation && isIndex(program, prop)) {
        const indexName = getIndexName(program, prop);
        if (indexName) {
          reportOnce(indexName, prop, `idx:${indexName}`);
        }
      }

      if (!isRelation && isUnique(program, prop)) {
        const uniqueName = getUniqueName(program, prop);
        if (uniqueName) {
          reportOnce(uniqueName, prop, `uniq:${uniqueName}`);
        }
      }
    }
  }
}

// ─── @polymorphic / @goType / @indexUsing validation ────────────────────────

export function validatePolymorphicProperties(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  for (const { model } of tableModels) {
    const columnNames = new Set<string>();
    for (const prop of walkPropertiesInherited(model)) {
      if (!isIgnored(program, prop)) {
        columnNames.add(getColumnName(program, prop));
      }
    }

    for (const prop of walkPropertiesInherited(model)) {
      const config = getPolymorphicConfig(program, prop);
      if (!config) continue;

      if (config.allowedTypes.length === 0) {
        reportDiagnostic(program, {
          code: "polymorphic-empty-allowed-types",
          target: prop,
          format: { propName: prop.name },
        });
      }

      if (config.idColumn && !columnNames.has(config.idColumn)) {
        reportDiagnostic(program, {
          code: "polymorphic-column-conflict",
          target: prop,
          format: { propName: prop.name, columnName: config.idColumn },
        });
      }
    }
  }
}

export function validateGoTypeAndIndexUsing(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  for (const { model } of tableModels) {
    for (const prop of walkPropertiesInherited(model)) {
      const goType = getGoType(program, prop);
      if (goType && (!goType.importPath || !goType.typeName)) {
        reportDiagnostic(program, {
          code: "go-type-malformed",
          target: prop,
          format: { propName: prop.name, value: goType.raw },
        });
      }

      const method = getIndexUsing(program, prop);
      if (method && !isIndex(program, prop) && !isUnique(program, prop) && !isKey(program, prop)) {
        reportDiagnostic(program, {
          code: "index-using-on-non-index",
          target: prop,
          format: { propName: prop.name, method },
        });
      }
    }
  }
}
