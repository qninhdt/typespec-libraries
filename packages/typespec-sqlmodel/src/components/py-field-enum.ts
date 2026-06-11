/**
 * PyField — enum-typed property generator.
 */

import type { Enum, ModelProperty, Program } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import { getDefaultValue, getDoc, isIndex, isKey, isUnique } from "@qninhdt/typespec-orm";
import { FOUR_SPACES, pythonStringLiteral } from "./PyConstants.js";

export function generateEnumField(
  program: Program,
  prop: ModelProperty,
  pyFieldName: string,
  enumInfo: { enumType: Enum; members: EnumMemberInfo[] },
  saImports: Set<string>,
  needsField: { value: boolean },
  needsColumn: { value: boolean },
  isPartOfCompositeUnique?: boolean,
  isPartOfCompositePk?: boolean,
): string {
  const enumTypeName = enumInfo.enumType.name;
  let pyType = enumTypeName;
  const isOptional = prop.optional;
  // Composite PK members get primary_key=True even without @key.
  const isPk = isKey(program, prop) || (isPartOfCompositePk ?? false);

  if (isOptional) {
    pyType = `${pyType} | None`;
  }

  needsField.value = true;
  needsColumn.value = true;
  saImports.add("sqlalchemy.Column");
  // Render the column as a plain TEXT so the resulting DDL is the
  // conventional `<col> TEXT NOT NULL` shape that pairs with a
  // hand-authored CHECK constraint in migrations. SQLAlchemy's SAEnum
  // would create a real Postgres ENUM type via `CREATE TYPE … AS ENUM
  // (...)`, which is destructive against existing TEXT/CHECK columns
  // and incompatible with hand-written migration files. The Python type
  // stays as the generated str-enum class so callers still get type
  // safety on read/write — SQLAlchemy round-trips a str-enum through a
  // Text column without an explicit type adapter.
  saImports.add("sqlalchemy.Text");
  const columnArgs: string[] = ["Text"];

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
