/**
 * PyField — enum-typed property generator.
 */

import type { Enum, ModelProperty, Program } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  camelToSnake,
  getDefaultValue,
  getDoc,
  isIndex,
  isKey,
  isUnique,
} from "@qninhdt/typespec-orm";
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

  // Always pin a Postgres enum-type name so renaming the Python class doesn't
  // diff the migration. `name=` is what SQLAlchemy/Atlas hash on for the
  // enum-type identity.
  const enumTypeIdent = camelToSnake(enumTypeName);
  const columnArgs: string[] = [
    `SAEnum(${enumTypeName}, name=${pythonStringLiteral(enumTypeIdent)})`,
  ];

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
