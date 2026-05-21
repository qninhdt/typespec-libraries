import { createPackage } from "@alloy-js/typescript";

export const zod = createPackage({
  name: "zod",
  version: "^4.4.3",
  descriptor: {
    ".": {
      named: ["z"],
    },
  },
});
