/**
 * PyField -Functions for generating SQLModel field definitions.
 *
 * Returns plain strings. Called imperatively by PyModel.
 */

import {
  getMaxLength as tsGetMaxLength,
  getMaxValue as tsGetMaxValue,
  getMinLength as tsGetMinLength,
  getMinValue as tsGetMinValue,
  getMinValueExclusive as tsGetMinValueExclusive,
  getMaxValueExclusive as tsGetMaxValueExclusive,
  getPattern as tsGetPattern,
  type Enum,
  type Model,
  type ModelProperty,
  type Program,
  type Scalar,
} from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  getOrmScalarName,
  getColumnName,
  getCompositeFields,
  getDefaultValue,
  getDefaultExpression,
  getDoc,
  getForeignKeyConfig,
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
  isCustomScalar,
  NUMERIC_TYPES,
} from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import type { SqlModelEmitterOptions } from "../lib.js";
import {
  FOUR_SPACES,
  NEEDS_SA_COLUMN,
  getPythonTypeMap,
  pythonStringLiteral,
  promoteFieldArgsToColumn,
  serializeColumnKwargs,
  getNativePydanticType,
} from "./PyConstants.js";
import { renderServerDefault } from "./py-field-utils.js";

export interface ResolvedForeignKeyFieldInfo {
  targetTable: string;
  targetColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

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
  relationForeignKey?: ResolvedForeignKeyFieldInfo,
  collectionStrategy?: SqlModelEmitterOptions["collection-strategy"],
  scalarAliasNames?: ReadonlyMap<Scalar, string>,
): string {
  // Skip composite type fields - they are configuration only
  if (getCompositeFields(program, prop)) {
    return "";
  }

  const columnName = getColumnName(program, prop);
  const pyFieldName = columnName;

  // Check for array type
  if (isArrayType(prop.type)) {
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
      collectionStrategy,
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
      needsField,
      needsColumn,
      isPartOfCompositeUnique,
    );
  }

  const mapping = dbType ? getPythonTypeMap(dbType) : getPythonTypeMap("unknown");

  for (const imp of mapping.imports) stdImports.add(imp);

  let pyType = mapping.pyType;

  const isOptional = prop.optional;
  const isPk = isKey(program, prop);
  const isSoft = isSoftDelete(program, prop);
  const isAutoInc = isAutoIncrement(program, prop) || dbType === "serial" || dbType === "bigserial";
  const isIndexed = isIndex(program, prop);
  // Skip unique=True if field is part of composite unique (handled by __table_args__)
  const isUnq = isUnique(program, prop) && !isPartOfCompositeUnique;
  const defaultExpr = getDefaultExpression(program, prop);
  const defaultVal = defaultExpr ?? getDefaultValue(program, prop);
  const fk = getForeignKeyConfig(program, prop);
  const prec = getPrecision(program, prop);
  const autoCreate = isAutoCreateTime(program, prop);
  const autoUpdate = isAutoUpdateTime(program, prop);

  const semanticScalarName = prop.type.kind === "Scalar" ? getOrmScalarName(prop.type) : undefined;

  // Custom scalar overrides using shared helper
  let usesScalarAlias = false;
  let usesNativeScalar = false;
  if (prop.type.kind === "Scalar" && isCustomScalar(program, prop.type)) {
    const nativeType = getNativePydanticType(semanticScalarName ?? prop.type.name);
    if (nativeType) {
      stdImports.add(`pydantic.${nativeType}`);
      pyType = nativeType;
      usesNativeScalar = true;
    } else {
      pyType = scalarAliasNames?.get(prop.type) ?? prop.type.name;
      usesScalarAlias = true;
    }
  }

  // When using a scalar alias, only read constraints directly applied on the
  // property itself (raw TypeSpec getters). Constraints inherited from the scalar
  // definition are already in _scalars.py — don't duplicate them.
  // Native semantic scalars also use direct property constraints only; their
  // scalar-defined constraints are already represented by the native type.
  const useDirectPropertyConstraints = usesScalarAlias || usesNativeScalar;
  const propMaxLen = useDirectPropertyConstraints
    ? tsGetMaxLength(program, prop)
    : getMaxLength(program, prop);
  const propMinLen = useDirectPropertyConstraints
    ? tsGetMinLength(program, prop)
    : getMinLength(program, prop);
  const propMinVal = useDirectPropertyConstraints
    ? tsGetMinValue(program, prop)
    : getMinValue(program, prop);
  const propMaxVal = useDirectPropertyConstraints
    ? tsGetMaxValue(program, prop)
    : getMaxValue(program, prop);
  const propMinValExcl = useDirectPropertyConstraints
    ? tsGetMinValueExclusive(program, prop)
    : getMinValueExclusive(program, prop);
  const propMaxValExcl = useDirectPropertyConstraints
    ? tsGetMaxValueExclusive(program, prop)
    : getMaxValueExclusive(program, prop);
  const propPattern = useDirectPropertyConstraints
    ? tsGetPattern(program, prop)
    : getPattern(program, prop);

  if (isOptional || isSoft) {
    pyType = `${pyType} | None`;
  }

  // After custom-scalar overrides have had a chance to resolve, fire an
  // `unsupported-type` diagnostic if we still don't know how to map the
  // underlying TypeSpec type to a Python/SQLAlchemy type.
  if (!dbType && !usesScalarAlias && !usesNativeScalar) {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: { typeName: prop.type.kind, propName: prop.name },
      target: prop,
    });
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
  // PK implies not-null in SQLAlchemy, so don't repeat.
  if (!isPk && !isOptional) {
    columnArgs.push("nullable=False");
  }
  if ((isOptional || isSoft) && !isPk) {
    needsField.value = true;
    fieldArgs.push("default=None");
  }

  // Index
  if (isIndexed || fk || relationForeignKey) {
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
    if (propMinLen !== undefined) {
      needsField.value = true;
      fieldArgs.push(`min_length=${propMinLen}`);
    }
    if (propMaxLen !== undefined) {
      needsField.value = true;
      fieldArgs.push(`max_length=${propMaxLen}`);
    } else if (!usesScalarAlias && !usesNativeScalar && dbType === "string") {
      needsField.value = true;
      fieldArgs.push("max_length=255");
    }
  }

  // Numeric range constraints
  const isNumericType = dbType !== undefined && NUMERIC_TYPES.has(dbType);
  if (isNumericType) {
    if (propMinValExcl !== undefined) {
      needsField.value = true;
      fieldArgs.push(`gt=${propMinValExcl}`);
    } else if (propMinVal !== undefined) {
      needsField.value = true;
      fieldArgs.push(`ge=${propMinVal}`);
    }

    if (propMaxValExcl !== undefined) {
      needsField.value = true;
      fieldArgs.push(`lt=${propMaxValExcl}`);
    } else if (propMaxVal !== undefined) {
      needsField.value = true;
      fieldArgs.push(`le=${propMaxVal}`);
    }
  }

  // Precision override
  let overrideSaColumnType: string | undefined;
  if (prec && (dbType === "decimal" || dbType === "float32" || dbType === "float64")) {
    overrideSaColumnType = `Numeric(${prec.precision}, ${prec.scale})`;
    saImports.add("sqlalchemy.Numeric");
  }

  // Pattern constraint
  if (propPattern) {
    needsField.value = true;
    fieldArgs.push(`pattern=${pythonStringLiteral(propPattern)}`);
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
  if (defaultVal !== undefined && !isPk && !autoCreate && !autoUpdate) {
    needsColumn.value = true;
    columnArgs.push(
      `server_default=${renderServerDefault(program, prop, defaultVal, saImports)}`,
    );
  }

  // Foreign key with cascade constraints
  // Handle both: 1) explicit @foreignKey on this property, 2) FK field referenced by a relation
  const hasForeignKey = fk || relationForeignKey;
  if (hasForeignKey) {
    needsField.value = true;

    // Get FK info from either explicit @foreignKey or from relation
    const onDel = relationForeignKey?.onDelete ?? getOnDelete(program, prop);
    const onUpd = relationForeignKey?.onUpdate ?? getOnUpdate(program, prop);

    let targetTable: string | undefined;
    let fkColumn: string | undefined;

    if (fk && prop.type.kind === "Model") {
      // Explicit @foreignKey on this property
      const targetModel = prop.type as Model;
      targetTable =
        targetModel && targetModel.kind === "Model"
          ? getTableName(program, targetModel)
          : undefined;
      fkColumn = fk.target ?? "id";
    } else if (relationForeignKey) {
      targetTable = relationForeignKey.targetTable;
      fkColumn = relationForeignKey.targetColumn;
    }

    if (targetTable && fkColumn) {
      const foreignKeyRef = pythonStringLiteral(`${targetTable}.${fkColumn}`);
      if (onDel || onUpd) {
        needsColumn.value = true;
        saImports.add("sqlalchemy.ForeignKey");
        const fkArgs: string[] = [foreignKeyRef];
        if (onDel) fkArgs.push(`ondelete=${pythonStringLiteral(onDel)}`);
        if (onUpd) fkArgs.push(`onupdate=${pythonStringLiteral(onUpd)}`);
        columnArgs.unshift(`ForeignKey(${fkArgs.join(", ")})`);
      } else {
        fieldArgs.push(`foreign_key=${foreignKeyRef}`);
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
    columnArgs.push(`comment=${pythonStringLiteral(doc)}`);
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
  _columnName: string,
  stdImports: Set<string>,
  saImports: Set<string>,
  _sqlmodelImports: Set<string>,
  needsField: { value: boolean },
  needsColumn: { value: boolean },
  collectionStrategy?: SqlModelEmitterOptions["collection-strategy"],
): string {
  // Handle both "Array" kind and Model with indexer (newer TypeSpec)
  const elementType = getArrayElementType(prop.type);

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
  let arrayColumnType: string | undefined;

  if (!collectionStrategy) {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: { typeName: "array", propName: prop.name },
      target: prop,
    });
  } else if (collectionStrategy === "jsonb") {
    arrayColumnType = "JSONB";
    saImports.add("sqlalchemy.dialects.postgresql.JSONB");
  } else if (elementType) {
    const postgresArrayType = resolvePostgresArrayType(elementType);
    if (postgresArrayType) {
      arrayColumnType = `ARRAY(${postgresArrayType.expression})`;
      saImports.add("sqlalchemy.ARRAY");
      for (const imp of postgresArrayType.saImports) saImports.add(imp);
    } else {
      reportDiagnostic(program, {
        code: "unsupported-type",
        format: {
          typeName: elementDbType ?? elementType.kind,
          propName: prop.name,
        },
        target: prop,
      });
    }
  }

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
  if (defaultVal !== undefined && !isPk) {
    needsColumn.value = true;
    columnArgs.push(
      `server_default=${renderServerDefault(program, prop, defaultVal, saImports)}`,
    );
  }

  // Doc comment
  if (doc) {
    needsColumn.value = true;
    columnArgs.push(`comment=${pythonStringLiteral(doc)}`);
  }

  if (arrayColumnType) {
    needsField.value = true;
    needsColumn.value = true;
    saImports.add("sqlalchemy.Column");
    const allColumnArgs = [arrayColumnType, ...columnArgs].join(", ");
    fieldArgs.push(`sa_column=Column(${allColumnArgs})`);
    return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
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

function resolvePostgresArrayType(
  type: ModelProperty["type"],
): { expression: string; saImports: string[] } | undefined {
  if (type.kind === "ModelProperty") {
    return resolvePostgresArrayType(type.type);
  }
  if (type.kind === "Enum") {
    return {
      expression: `SAEnum(${type.name})`,
      saImports: ["sqlalchemy.Enum as SAEnum"],
    };
  }

  const dbType = resolveDbType(type);

  switch (dbType) {
    case "uuid":
      return {
        expression: "PGUUID(as_uuid=True)",
        saImports: ["sqlalchemy.dialects.postgresql.UUID as PGUUID"],
      };
    case "string":
      return { expression: "String", saImports: ["sqlalchemy.String"] };
    case "text":
      return { expression: "Text", saImports: ["sqlalchemy.Text"] };
    case "boolean":
      return { expression: "Boolean", saImports: ["sqlalchemy.Boolean"] };
    case "int8":
    case "int16":
      return { expression: "SmallInteger", saImports: ["sqlalchemy.SmallInteger"] };
    case "int32":
    case "serial":
      return { expression: "Integer", saImports: ["sqlalchemy.Integer"] };
    case "int64":
    case "bigserial":
    case "uint32":
    case "uint64":
      return { expression: "BigInteger", saImports: ["sqlalchemy.BigInteger"] };
    case "uint8":
    case "uint16":
      return { expression: "Integer", saImports: ["sqlalchemy.Integer"] };
    case "float32":
      return { expression: "Float", saImports: ["sqlalchemy.Float"] };
    case "float64":
      return { expression: "Double", saImports: ["sqlalchemy.Double"] };
    case "decimal":
      return { expression: "Numeric", saImports: ["sqlalchemy.Numeric"] };
    case "date":
      return { expression: "Date", saImports: ["sqlalchemy.Date"] };
    case "time":
      return { expression: "Time", saImports: ["sqlalchemy.Time"] };
    case "utcDateTime":
      return { expression: "DateTime(timezone=True)", saImports: ["sqlalchemy.DateTime"] };
    default:
      return undefined;
  }
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
  if (defaultVal !== undefined)
    columnArgs.push(`server_default=${pythonStringLiteral(defaultVal)}`);

  const doc = getDoc(program, prop);
  if (doc) columnArgs.push(`comment=${pythonStringLiteral(doc)}`);

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
