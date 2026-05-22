import { createPackage } from "@alloy-js/typescript";

/**
 * Single source of truth for the Zod version pin. Used both by the
 * emitter package metadata (createPackage) and by the generated
 * standalone package.json so the two never drift apart.
 */
export const ZOD_VERSION = "^4.4.3";

export const zod = createPackage({
  name: "zod",
  version: ZOD_VERSION,
  descriptor: {
    ".": {
      named: ["z"],
    },
  },
});
