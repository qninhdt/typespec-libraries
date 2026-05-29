// Aggregator re-exporting every $name decorator implementation. Keeps the
// surface in one place so src/index.ts can register all decorators in a single
// import block.

export { $message, $field, $reserve, $oneof } from "./decorators-message.js";

export type { ProtoReservation } from "./decorators-message.js";

export { $service, $rpc, $keepEmptyRequest, $package } from "./decorators-service.js";

export type { ProtoPackageDetails, ProtoPackageSpec } from "./decorators-service.js";

export { $ignore, $rename, $goType, $map } from "./decorators-field.js";

export type { ProtoGoTypeSpec, ProtoMapSpec } from "./decorators-field.js";
