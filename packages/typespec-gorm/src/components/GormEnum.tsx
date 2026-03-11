/**
 * GormEnum -JSX component for Go enum type definitions.
 * Renders: `type X string` + `const (...)` block.
 */

import { code, For } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import { camelToPascal, camelToSnake } from "@qninhdt/typespec-orm";

export interface GormEnumProps {
  readonly name: string;
  readonly members: EnumMemberInfo[];
}

export function GormEnum(props: GormEnumProps): Children {
  const goTypeName = camelToPascal(props.name);

  return code`
// ${goTypeName} represents the ${camelToSnake(props.name)} enum.
type ${goTypeName} string

const (
${(
  <For each={props.members} joiner={"\n"}>
    {(m: EnumMemberInfo) => {
      const constName = `${goTypeName}${camelToPascal(m.name)}`;
      return code`\t${constName} ${goTypeName} = "${m.value}"`;
    }}
  </For>
)}
)
`;
}
