/**
 * PyField — focused builder helpers used by the regular-field generator.
 *
 * Each builder mutates the supplied fieldArgs/columnArgs/imports based on
 * decorator-driven facts about a single property. `generateField` composes
 * them in order.
 */

import type { Model, ModelProperty, Program, Type } from "@typespec/compiler";
import {
  getAuditRole,
  getClassification,
  getDefaultExpression,
  getDefaultValue,
  getDoc,
  getForeignKeyConfig,
  getOnDelete,
  getOnUpdate,
  getOwner,
  getPlaceholder,
  getScopes,
  getTableName,
  getTitle,
  isAutoCreateTime,
  isAutoIncrement,
  isAutoUpdateTime,
  isIndex,
  isKey,
  isSoftDelete,
  isUnique,
  NUMERIC_TYPES,
} from "@qninhdt/typespec-orm";
import {
  FOUR_SPACES,
  NEEDS_SA_COLUMN,
  promoteFieldArgsToColumn,
  pythonStringLiteral,
  serializeColumnKwargs,
  type PythonTypeMapping,
} from "./PyConstants.js";
import { renderServerDefault } from "./py-field-utils.js";
import type { EffectivePropertyConstraints } from "./py-property-constraints.js";

export interface ResolvedForeignKeyFieldInfo {
  targetTable: string;
  targetColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface FieldFlags {
  needsField: { value: boolean };
  needsColumn: { value: boolean };
}

export interface FieldImports {
  std: Set<string>;
  sa: Set<string>;
}

export interface FieldArgState {
  fieldArgs: string[];
  columnArgs: string[];
}

/**
 * Type-safe narrowing for foreign-key targets. Returns the target Model only
 * when the property's type really is a Model — never casts blindly.
 */
export function asModelTarget(type: Type): Model | undefined {
  return type.kind === "Model" ? type : undefined;
}

export function buildPkArgs(
  program: Program,
  prop: ModelProperty,
  dbType: string | undefined,
  state: FieldArgState,
  imports: FieldImports,
  flags: FieldFlags,
): boolean {
  const isPk = isKey(program, prop);
  if (!isPk) return false;
  flags.needsField.value = true;
  if (dbType === "uuid") {
    imports.std.add("uuid.uuid4");
    state.fieldArgs.push("default_factory=uuid4");
  }
  state.fieldArgs.push("primary_key=True");
  return true;
}

export function buildConstraintArgs(args: {
  program: Program;
  prop: ModelProperty;
  dbType: string | undefined;
  isPk: boolean;
  isOptional: boolean;
  isSoft: boolean;
  isAutoInc: boolean;
  isPartOfCompositeUnique: boolean;
  hasRelationFk: boolean;
  constraints: EffectivePropertyConstraints;
  usesScalarAlias: boolean;
  usesNativeScalar: boolean;
  state: FieldArgState;
  imports: FieldImports;
  flags: FieldFlags;
}): void {
  const {
    program,
    prop,
    dbType,
    isPk,
    isOptional,
    isSoft,
    isAutoInc,
    isPartOfCompositeUnique,
    hasRelationFk,
    constraints,
    usesScalarAlias,
    usesNativeScalar,
    state,
    imports,
    flags,
  } = args;

  if (isAutoInc && !isPk) {
    flags.needsColumn.value = true;
    state.columnArgs.push("autoincrement=True");
  }

  if (!isPk && !isOptional) {
    state.columnArgs.push("nullable=False");
  }
  if ((isOptional || isSoft) && !isPk) {
    flags.needsField.value = true;
    state.fieldArgs.push("default=None");
  }

  const fk = getForeignKeyConfig(program, prop);
  if (isIndex(program, prop) || fk || hasRelationFk) {
    flags.needsField.value = true;
    state.fieldArgs.push("index=True");
  }

  if (isUnique(program, prop) && !isPartOfCompositeUnique) {
    flags.needsField.value = true;
    state.fieldArgs.push("unique=True");
  }

  const isStringType = dbType === "string" || dbType === "text";
  if (isStringType) {
    if (constraints.minLen !== undefined) {
      flags.needsField.value = true;
      state.fieldArgs.push(`min_length=${constraints.minLen}`);
    }
    if (constraints.maxLen !== undefined) {
      flags.needsField.value = true;
      state.fieldArgs.push(`max_length=${constraints.maxLen}`);
    } else if (!usesScalarAlias && !usesNativeScalar && dbType === "string") {
      flags.needsField.value = true;
      state.fieldArgs.push("max_length=255");
    }
  }

  const isNumericType = dbType !== undefined && NUMERIC_TYPES.has(dbType);
  if (isNumericType) {
    if (constraints.minValExcl !== undefined) {
      flags.needsField.value = true;
      state.fieldArgs.push(`gt=${constraints.minValExcl}`);
    } else if (constraints.minVal !== undefined) {
      flags.needsField.value = true;
      state.fieldArgs.push(`ge=${constraints.minVal}`);
    }
    if (constraints.maxValExcl !== undefined) {
      flags.needsField.value = true;
      state.fieldArgs.push(`lt=${constraints.maxValExcl}`);
    } else if (constraints.maxVal !== undefined) {
      flags.needsField.value = true;
      state.fieldArgs.push(`le=${constraints.maxVal}`);
    }
  }

  if (constraints.pattern) {
    flags.needsField.value = true;
    state.fieldArgs.push(`pattern=${pythonStringLiteral(constraints.pattern)}`);
  }

  const autoCreate = isAutoCreateTime(program, prop);
  const autoUpdate = isAutoUpdateTime(program, prop);
  if (autoCreate) {
    flags.needsColumn.value = true;
    imports.sa.add("sqlalchemy.func");
    state.columnArgs.push("server_default=func.now()");
  }
  if (autoUpdate) {
    flags.needsColumn.value = true;
    imports.sa.add("sqlalchemy.func");
    state.columnArgs.push("onupdate=func.now()");
    if (!autoCreate) {
      state.columnArgs.push("server_default=func.now()");
    }
  }

  const defaultExpr = getDefaultExpression(program, prop);
  const defaultVal = defaultExpr ?? getDefaultValue(program, prop);
  if (defaultVal !== undefined && !isPk && !autoCreate && !autoUpdate) {
    flags.needsColumn.value = true;
    state.columnArgs.push(
      `server_default=${renderServerDefault(program, prop, defaultVal, imports.sa)}`,
    );
  }
}

export function buildFkArgs(args: {
  program: Program;
  prop: ModelProperty;
  relationForeignKey: ResolvedForeignKeyFieldInfo | undefined;
  state: FieldArgState;
  imports: FieldImports;
  flags: FieldFlags;
}): void {
  const { program, prop, relationForeignKey, state, imports, flags } = args;
  const fk = getForeignKeyConfig(program, prop);
  const hasForeignKey = fk || relationForeignKey;
  if (!hasForeignKey) return;

  flags.needsField.value = true;

  const onDel = relationForeignKey?.onDelete ?? getOnDelete(program, prop);
  const onUpd = relationForeignKey?.onUpdate ?? getOnUpdate(program, prop);

  let targetTable: string | undefined;
  let fkColumn: string | undefined;

  if (fk) {
    const targetModel = asModelTarget(prop.type);
    targetTable = targetModel ? getTableName(program, targetModel) : undefined;
    fkColumn = fk.target ?? "id";
  } else if (relationForeignKey) {
    targetTable = relationForeignKey.targetTable;
    fkColumn = relationForeignKey.targetColumn;
  }

  if (targetTable && fkColumn) {
    const foreignKeyRef = pythonStringLiteral(`${targetTable}.${fkColumn}`);
    if (onDel || onUpd) {
      flags.needsColumn.value = true;
      imports.sa.add("sqlalchemy.ForeignKey");
      const fkArgs: string[] = [foreignKeyRef];
      if (onDel) fkArgs.push(`ondelete=${pythonStringLiteral(onDel)}`);
      if (onUpd) fkArgs.push(`onupdate=${pythonStringLiteral(onUpd)}`);
      state.columnArgs.unshift(`ForeignKey(${fkArgs.join(", ")})`);
    } else {
      state.fieldArgs.push(`foreign_key=${foreignKeyRef}`);
    }
  }
}

export interface FinalizeColumnArgs {
  prop: ModelProperty;
  pyFieldName: string;
  pyType: string;
  dbType: string | undefined;
  mapping: PythonTypeMapping;
  isPk: boolean;
  overrideSaColumnType: string | undefined;
  doc: string | undefined;
  state: FieldArgState;
  imports: FieldImports;
  flags: FieldFlags;
}

export function finalizeColumn(args: FinalizeColumnArgs): string {
  const {
    pyFieldName,
    pyType,
    dbType,
    mapping,
    isPk,
    overrideSaColumnType,
    doc,
    state,
    imports,
    flags,
  } = args;

  if (doc) {
    flags.needsColumn.value = true;
    state.columnArgs.push(`comment=${pythonStringLiteral(doc)}`);
  }
  // The doc text is round-tripped to the DB via the SQLModel `comment=` kwarg
  // above, so we deliberately do NOT also emit it as a `# comment` line — that
  // would duplicate the same text in two places and drift if one is updated.

  const effectiveSaColumnType = overrideSaColumnType ?? mapping.saColumnType ?? "";
  const needsExplicitColumn =
    (dbType && NEEDS_SA_COLUMN.has(dbType) && effectiveSaColumnType && !isPk) ||
    overrideSaColumnType ||
    state.columnArgs.some((a) => a.startsWith("ForeignKey("));

  if (needsExplicitColumn) {
    for (const imp of mapping.saImports) imports.sa.add(imp);
    imports.sa.add("sqlalchemy.Column");
    flags.needsColumn.value = true;
    flags.needsField.value = true;
    const filteredFieldArgs = promoteFieldArgsToColumn(
      state.fieldArgs,
      state.columnArgs,
      imports.sa,
    );
    const saType = effectiveSaColumnType || mapping.saColumnType;
    const allColumnArgs = saType
      ? [saType, ...state.columnArgs].join(", ")
      : state.columnArgs.join(", ");
    filteredFieldArgs.push(`sa_column=Column(${allColumnArgs})`);
    return `${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${filteredFieldArgs.join(", ")})\n`;
  }

  if (state.fieldArgs.length > 0 || state.columnArgs.length > 0) {
    flags.needsField.value = true;
    if (state.columnArgs.length > 0) {
      state.fieldArgs.push(`sa_column_kwargs=${serializeColumnKwargs(state.columnArgs)}`);
    }
    return `${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${state.fieldArgs.join(", ")})\n`;
  }

  return `${FOUR_SPACES}${pyFieldName}: ${pyType}\n`;
}

export function buildSoftDeleteIndex(
  program: Program,
  prop: ModelProperty,
  state: FieldArgState,
  flags: FieldFlags,
): void {
  if (!isSoftDelete(program, prop)) return;
  flags.needsField.value = true;
  if (!state.fieldArgs.some((a) => a.startsWith("index="))) {
    state.fieldArgs.push("index=True");
  }
}

/**
 * Surface form-metadata (`@title`, `@placeholder`) as a Pydantic
 * `json_schema_extra={...}` Field arg, and catalog metadata (`@audit`,
 * `@owner`, `@classification`, `@scope`) as SQLAlchemy `info={...}` on the
 * column.
 *
 * Form metadata stays in `Field(json_schema_extra=...)` so Pydantic
 * JSON-Schema surfaces it (matches the PyDataModel side). Catalog metadata is
 * more useful next to the SQL column, so it lands in `info=` (mapped through
 * `sa_column_kwargs` when no explicit `Column(...)` is generated).
 */
export function buildMetadataArgs(
  program: Program,
  prop: ModelProperty,
  state: FieldArgState,
  flags: FieldFlags,
): void {
  // ─── Form metadata → Pydantic json_schema_extra ─────────────────────────
  const titleVal = getTitle(program, prop);
  const placeholderVal = getPlaceholder(program, prop);
  const schemaExtra: Record<string, string> = {};
  if (titleVal) schemaExtra["title"] = pythonStringLiteral(titleVal);
  if (placeholderVal) schemaExtra["placeholder"] = pythonStringLiteral(placeholderVal);
  if (Object.keys(schemaExtra).length > 0) {
    flags.needsField.value = true;
    const entries = Object.entries(schemaExtra)
      .map(([k, v]) => `"${k}": ${v}`)
      .join(", ");
    state.fieldArgs.push(`json_schema_extra={${entries}}`);
  }

  // ─── Catalog metadata → SQLAlchemy Column.info ──────────────────────────
  const info: Record<string, string> = {};
  const auditRole = getAuditRole(program, prop);
  if (auditRole) info["audit"] = pythonStringLiteral(auditRole);
  // `@owner` only attaches to models/namespaces. Inherit it from the property's
  // parent model so per-column info still carries the catalog owner.
  const ownerTarget = prop.model;
  const owner = ownerTarget ? getOwner(program, ownerTarget) : undefined;
  if (owner) info["owner"] = pythonStringLiteral(owner);
  const classification = getClassification(program, prop);
  if (classification) info["classification"] = pythonStringLiteral(classification);
  const scopes = getScopes(program, prop);
  if (scopes.length > 0) {
    info["scope"] = `[${scopes.map((s) => pythonStringLiteral(s)).join(", ")}]`;
  }
  if (Object.keys(info).length > 0) {
    flags.needsField.value = true;
    const entries = Object.entries(info)
      .map(([k, v]) => `"${k}": ${v}`)
      .join(", ");
    state.columnArgs.push(`info={${entries}}`);
  }
}

export function getFieldDoc(program: Program, prop: ModelProperty): string | undefined {
  return getDoc(program, prop);
}

export function shouldSkipAutoIncFlag(
  program: Program,
  prop: ModelProperty,
  dbType: string | undefined,
): boolean {
  return !(isAutoIncrement(program, prop) || dbType === "serial" || dbType === "bigserial");
}
