export { $lib } from "./lib.js";
export {
  ProtoPackageKey,
  ProtoServiceKey,
  StreamKey,
  ProtoFieldKey,
  ProtoImportKey,
  ProtoMapKey,
  reportDiagnostic,
} from "./lib.js";

import {
  $protoPackage,
  $protoService,
  $stream,
  $protoField,
  $protoImport,
  $protoMap,
} from "./decorators.js";

export const $decorators = {
  "Qninhdt.Proto": {
    protoPackage: $protoPackage,
    protoService: $protoService,
    stream: $stream,
    protoField: $protoField,
    protoImport: $protoImport,
    protoMap: $protoMap,
  },
};

export { $onEmit } from "./proto-emitter.js";
