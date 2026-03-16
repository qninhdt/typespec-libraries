/**
 * PyField -Functions for generating SQLModel field definitions.
 *
 * Returns plain strings. Called imperatively by PyModel.
 */

import type { Enum, Model, ModelProperty, Program } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  getColumnName,
  getCompositeFields,
  getDefaultValue,
  getDoc,
  getForeignKey,
  getFormat,
  getMaxLength,
  getMaxValue,
  getMinLength,
  getMinValue,
  getMaxItems,
  getMinItems,
  getMinValueExclusive,
  getMaxValueExclusive,
  getOnDelete,
  getOnUpdate,
  getPattern,
  getPrecision,
  getPropertyEnum,
  getTableName,
  isAutoCreateTime,
  isAutoIncrement,
  isAutoUpdateTime,
  isKey,
  isIndex,
  isSoftDelete,
  isUnique,
  resolveDbType,
  isArrayType,
  getArrayElementType,
  camelToSnake,
  NUMERIC_TYPES,
} from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import {
  FOUR_SPACES,
  NEEDS_SA_COLUMN,
  getPythonTypeMap,
  promoteFieldArgsToColumn,
  serializeColumnKwargs,
} from "./PyConstants.js";

/**
 * Generate a regular SQLModel field line.
 */
export function generateField(
  program: Program,
  prop: ModelProperty,
  stdImports: Set<string>,
  saImports: Set<string>,
  sqlmodelImports: Set<string>,
  needsField: { value: boolean },
  needsColumn: { value: boolean },
  isPartOfCompositeUnique?: boolean,
  fkTargetTable?: string,
): string {
  // Skip composite type fields - they are configuration only
  if (getCompositeFields(program, prop)) {
    return "";
  }

  const columnName = getColumnName(program, prop);
  const pyFieldName = columnName;

  // Check for array type - handle both "Array" kind and Model with indexer (newer TypeSpec)
  const isArray = isArrayType(prop.type) || (prop.type.kind === "Model" && !!prop.type.indexer);
  if (isArray) {
    return generateArrayField(
      program,
      prop,
      pyFieldName,
      columnName,
      stdImports,
      saImports,
      sqlmodelImports,
      needsField,
      needsColumn,
    );
  }

  const dbType = resolveDbType(prop.type);

  // Check for enum type
  const enumInfo = getPropertyEnum(prop);
  if (enumInfo) {
    return generateEnumField(
      program,
      prop,
      pyFieldName,
      columnName,
      enumInfo,
      saImports,
      sqlmodelImports,
      needsField,
      needsColumn,
      isPartOfCompositeUnique,
    );
  }

  const mapping = dbType ? getPythonTypeMap(dbType) : getPythonTypeMap("unknown");

  if (!dbType || mapping.pyType === "Any") {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: { typeName: dbType ?? prop.type.kind, propName: prop.name },
      target: prop,
    });
  }

  for (const imp of mapping.imports) stdImports.add(imp);

  let pyType = mapping.pyType;

  const isOptional = prop.optional;
  const isPk = isKey(program, prop);
  const isSoft = isSoftDelete(program, prop);
  const isAutoInc = isAutoIncrement(program, prop) || dbType === "serial" || dbType === "bigserial";
  const isIndexed = isIndex(program, prop);
  // Skip unique=True if field is part of composite unique (handled by __table_args__)
  const isUnq = isUnique(program, prop) && !isPartOfCompositeUnique;
  const maxLen = getMaxLength(program, prop);
  const defaultVal = getDefaultValue(program, prop);
  const fk = getForeignKey(program, prop);
  const prec = getPrecision(program, prop);
  const autoCreate = isAutoCreateTime(program, prop);
  const autoUpdate = isAutoUpdateTime(program, prop);

  // Format-based type overrides
  const format = getFormat(program, prop);
  if (format === "email") {
    stdImports.add("pydantic.EmailStr");
    pyType = "EmailStr";
  } else if (format === "url" || format === "uri") {
    stdImports.add("pydantic.AnyUrl");
    pyType = "AnyUrl";
  } else if (format !== undefined && format !== null && format !== "") {
    reportDiagnostic(program, {
      code: "unknown-format",
      target: prop,
      format: { format, propName: prop.name },
    });
  }

  if (isOptional || isSoft) {
    pyType = `${pyType} | None`;
  }

  const fieldArgs: string[] = [];
  const columnArgs: string[] = [];

  // Primary key
  if (isPk) {
    needsField.value = true;
    if (dbType === "uuid") {
      stdImports.add("uuid.uuid4");
      fieldArgs.push("default_factory=uuid4");
    }
    fieldArgs.push("primary_key=True");
  }

  // Auto-increment
  if (isAutoInc && !isPk) {
    needsColumn.value = true;
    columnArgs.push("autoincrement=True");
  }

  // Nullable
  if (!isOptional && !isPk) {
    columnArgs.push("nullable=False");
  }
  if (isOptional || isSoft) {
    needsField.value = true;
    fieldArgs.push("default=None");
  }

  // Index
  if (isIndexed || fk) {
    needsField.value = true;
    fieldArgs.push("index=True");
  }

  // Unique
  if (isUnq) {
    needsField.value = true;
    fieldArgs.push("unique=True");
  }

  // String length constraints
  const isStringType = dbType === "string" || dbType === "text";
  if (isStringType) {
    const minLen = getMinLength(program, prop);
    if (minLen !== undefined) {
      needsField.value = true;
      fieldArgs.push(`min_length=${minLen}`);
    }
    if (maxLen !== undefined) {
      needsField.value = true;
      fieldArgs.push(`max_length=${maxLen}`);
    } else if (dbType === "string") {
      needsField.value = true;
      fieldArgs.push("max_length=255");
    }
  }

  // Numeric range constraints
  const isNumericType = dbType !== undefined && NUMERIC_TYPES.has(dbType);
  if (isNumericType) {
    // Exclusive constraints take precedence over inclusive
    const minValExclusive = getMinValueExclusive(program, prop);
    const maxValExclusive = getMaxValueExclusive(program, prop);
    const minVal = getMinValue(program, prop);
    const maxVal = getMaxValue(program, prop);

    if (minValExclusive !== undefined) {
      needsField.value = true;
      fieldArgs.push(`gt=${minValExclusive}`);
    } else if (minVal !== undefined) {
      needsField.value = true;
      fieldArgs.push(`ge=${minVal}`);
    }

    if (maxValExclusive !== undefined) {
      needsField.value = true;
      fieldArgs.push(`lt=${maxValExclusive}`);
    } else if (maxVal !== undefined) {
      needsField.value = true;
      fieldArgs.push(`le=${maxVal}`);
    }
  }

  // Precision override
  let overrideSaColumnType: string | undefined;
  if (prec && (dbType === "decimal" || dbType === "float64")) {
    overrideSaColumnType = `Numeric(${prec.precision}, ${prec.scale})`;
    saImports.add("sqlalchemy.Numeric");
  }

  // Pattern constraint
  const pattern = getPattern(program, prop);
  if (pattern) {
    needsField.value = true;
    const escaped = pattern.replace(/\\/g, "\\\\");
    fieldArgs.push(`pattern=r"${escaped}"`);
  }

  // Server defaults
  if (autoCreate) {
    needsColumn.value = true;
    saImports.add("sqlalchemy.func");
    columnArgs.push("server_default=func.now()");
  }
  if (autoUpdate) {
    needsColumn.value = true;
    saImports.add("sqlalchemy.func");
    columnArgs.push("onupdate=func.now()");
    if (!autoCreate) {
      columnArgs.push("server_default=func.now()");
    }
  }

  // Default value (non-auto-timestamp)
  if (defaultVal && !isPk && !autoCreate && !autoUpdate) {
    needsColumn.value = true;
    columnArgs.push(`server_default="${defaultVal}"`);
  }

  // Foreign key with cascade constraints
  // Handle both: 1) explicit @foreignKey on this property, 2) FK field referenced by a relation
  const hasForeignKey = fk || fkTargetTable;
  if (hasForeignKey) {
    needsField.value = true;

    // Get FK info from either explicit @foreignKey or from relation
    const onDel = getOnDelete(program, prop);
    const onUpd = getOnUpdate(program, prop);

    let targetTable: string | undefined;
    let fkColumn: string | undefined;

    if (fk) {
      // Explicit @foreignKey on this property
      const targetModel = prop.type as Model;
      targetTable =
        targetModel && targetModel.kind === "Model"
          ? getTableName(program, targetModel)
          : undefined;
      fkColumn = fk;
    } else if (fkTargetTable) {
      // FK field referenced by a relation - use target table, FK is the primary key of target
      targetTable = fkTargetTable;
      fkColumn = "id";
    }

    if (targetTable && fkColumn) {
      // Always add foreign_key to Field
      fieldArgs.push(`foreign_key="${targetTable}.${fkColumn}"`);

      // If has cascade constraints, add to Column
      if (onDel || onUpd) {
        needsColumn.value = true;
        saImports.add("sqlalchemy.ForeignKey");
        const fkArgs: string[] = [`"${targetTable}.${fkColumn}"`];
        if (onDel) fkArgs.push(`ondelete="${onDel}"`);
        if (onUpd) fkArgs.push(`onupdate="${onUpd}"`);
        columnArgs.unshift(`ForeignKey(${fkArgs.join(", ")})`);
      }
    }
  }

  // Soft delete - add index
  if (isSoft) {
    needsField.value = true;
    if (!fieldArgs.some((a) => a.startsWith("index="))) {
      fieldArgs.push("index=True");
    }
  }

  // @doc → comment
  const doc = getDoc(program, prop);
  if (doc) {
    needsColumn.value = true;
    columnArgs.push(`comment="${doc.replace(/"/g, '\\"')}"`);
  }

  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";

  // Determine sa_column vs sa_column_kwargs
  const effectiveSaColumnType = overrideSaColumnType ?? mapping.saColumnType ?? "";
  const needsExplicitColumn =
    (dbType && NEEDS_SA_COLUMN.has(dbType) && effectiveSaColumnType && !isPk) ||
    overrideSaColumnType ||
    columnArgs.some((a) => a.startsWith("ForeignKey("));

  if (needsExplicitColumn) {
    for (const imp of mapping.saImports) saImports.add(imp);
    saImports.add("sqlalchemy.Column");
    needsColumn.value = true;
    needsField.value = true;
    const filteredFieldArgs = promoteFieldArgsToColumn(fieldArgs, columnArgs, saImports);
    const saType = effectiveSaColumnType || mapping.saColumnType;
    const allColumnArgs = saType ? [saType, ...columnArgs].join(", ") : columnArgs.join(", ");
    filteredFieldArgs.push(`sa_column=Column(${allColumnArgs})`);
    return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${filteredFieldArgs.join(", ")})\n`;
  }

  if (fieldArgs.length > 0 || columnArgs.length > 0) {
    needsField.value = true;
    if (columnArgs.length > 0) {
      fieldArgs.push(`sa_column_kwargs=${serializeColumnKwargs(columnArgs)}`);
    }
    return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
  }

  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType}\n`;
}

/**
 * Generate a field for an array-typed property with minItems/maxItems constraints.
 */
function generateArrayField(
  program: Program,
  prop: ModelProperty,
  pyFieldName: string,
  columnName: string,
  stdImports: Set<string>,
  saImports: Set<string>,
  sqlmodelImports: Set<string>,
  needsField: { value: boolean },
  needsColumn: { value: boolean },
): string {
  // Handle both "Array" kind and Model with indexer (newer TypeSpec)
  let elementType = getArrayElementType(prop.type);
  if (!elementType && prop.type.kind === "Model" && prop.type.indexer) {
    elementType = prop.type.indexer.value;
  }

  const elementDbType = elementType ? resolveDbType(elementType) : undefined;
  const elementPyType = elementDbType ? getPythonTypeMap(elementDbType).pyType : "Any";

  for (const imp of getPythonTypeMap(elementDbType ?? "unknown").imports) {
    stdImports.add(imp);
  }

  let pyType = `list[${elementPyType}]`;
  const isOptional = prop.optional;
  if (isOptional) {
    pyType = `${pyType} | None`;
  }

  const isPk = isKey(program, prop);
  const doc = getDoc(program, prop);
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";

  const fieldArgs: string[] = [];
  const columnArgs: string[] = [];

  // Primary key
  if (isPk) {
    needsField.value = true;
    fieldArgs.push("primary_key=True");
  }

  // Nullable
  if (!isOptional && !isPk) {
    columnArgs.push("nullable=False");
  }
  if (isOptional) {
    needsField.value = true;
    fieldArgs.push("default=None");
  }

  // Array constraints (minItems/maxItems)
  const minItems = getMinItems(program, prop);
  const maxItems = getMaxItems(program, prop);
  if (minItems !== undefined) {
    needsField.value = true;
    fieldArgs.push(`min_length=${minItems}`);
  }
  if (maxItems !== undefined) {
    needsField.value = true;
    fieldArgs.push(`max_length=${maxItems}`);
  }

  // Default value
  const defaultVal = getDefaultValue(program, prop);
  if (defaultVal && !isPk) {
    needsColumn.value = true;
    columnArgs.push(`server_default="${defaultVal}"`);
  }

  // Doc comment
  if (doc) {
    needsColumn.value = true;
    columnArgs.push(`comment="${doc.replace(/"/g, '\\"')}"`);
  }

  // Build the field
  if (fieldArgs.length > 0 || columnArgs.length > 0) {
    needsField.value = true;
    if (columnArgs.length > 0) {
      fieldArgs.push(`sa_column_kwargs=${serializeColumnKwargs(columnArgs)}`);
    }
    return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
  }

  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType}\n`;
}

/**
 * Generate a field for an enum-typed property.
 */
function generateEnumField(
  program: Program,
  prop: ModelProperty,
  pyFieldName: string,
  _columnName: string,
  enumInfo: { enumType: Enum; members: EnumMemberInfo[] },
  saImports: Set<string>,
  sqlmodelImports: Set<string>,
  needsField: { value: boolean },
  needsColumn: { value: boolean },
  isPartOfCompositeUnique?: boolean,
): string {
  const enumTypeName = enumInfo.enumType.name;
  let pyType = enumTypeName;
  const isOptional = prop.optional;
  const isPk = isKey(program, prop);

  if (isOptional) {
    pyType = `${pyType} | None`;
  }

  needsField.value = true;
  needsColumn.value = true;
  saImports.add("sqlalchemy.Column");

  const columnArgs: string[] = [`SAEnum(${enumTypeName})`];

  if (!isOptional && !isPk) columnArgs.push("nullable=False");
  if (isIndex(program, prop)) columnArgs.push("index=True");
  // Skip unique=True if field is part of composite unique (handled by __table_args__)
  if (isUnique(program, prop) && !isPartOfCompositeUnique) columnArgs.push("unique=True");

  const defaultVal = getDefaultValue(program, prop);
  if (defaultVal) columnArgs.push(`server_default="${defaultVal}"`);

  const doc = getDoc(program, prop);
  if (doc) columnArgs.push(`comment="${doc.replace(/"/g, '\\"')}"`);

  const fieldArgs: string[] = [];
  if (isOptional) fieldArgs.push("default=None");
  if (isPk) fieldArgs.push("primary_key=True");
  fieldArgs.push(`sa_column=Column(${columnArgs.join(", ")})`);

  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";
  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
}

/**
 * Generate an ignored field (ClassVar).
 */
export function generateIgnoredField(
  program: Program,
  prop: ModelProperty,
  stdImports: Set<string>,
  enumInfo?: { enumType: Enum; members: EnumMemberInfo[] } | null,
): string {
  const dbType = resolveDbType(prop.type);
  const mapping = dbType ? getPythonTypeMap(dbType) : getPythonTypeMap("unknown");
  let pyType = mapping.pyType;
  if (enumInfo) {
    pyType = enumInfo.enumType.name;
  } else {
    for (const imp of mapping.imports) stdImports.add(imp);
  }
  stdImports.add("typing.ClassVar");
  const finalType = prop.optional ? `${pyType} | None` : pyType;
  const doc = getDoc(program, prop);
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";
  return `${docComment}${FOUR_SPACES}${camelToSnake(prop.name)}: ClassVar[${finalType}]  # @ignore - not persisted\n`;
}
