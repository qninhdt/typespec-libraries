/**
 * Emits the shared `_meta.ts` file containing the `FormFieldMeta`
 * interface used by every model's `Meta` object.
 *
 * Kept as a tiny standalone source so the interface is declared exactly
 * once per emit output (model files import it relative to the package
 * root).
 */
import { Children } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/typescript";
import { FORM_FIELD_META_INTERFACE_SOURCE } from "./meta-builder.js";

export interface ZodMetaFileProps {
  readonly path?: string;
}

export const META_FILE_NAME = "_meta";

export function ZodMetaFile(props: ZodMetaFileProps): Children {
  return (
    <SourceFile path={props.path ?? `${META_FILE_NAME}.ts`}>
      {`export ${FORM_FIELD_META_INTERFACE_SOURCE}\n`}
    </SourceFile>
  );
}
