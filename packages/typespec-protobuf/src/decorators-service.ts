import type { DecoratorContext, Interface, Namespace, Operation } from "@typespec/compiler";
import { ServiceKey, RpcKey, KeepEmptyRequestKey, PackageKey } from "./lib.js";

/**
 * Per-language proto package options. Mirrors `option <lang>_package` lines in
 * the emitted `.proto`.
 */
export interface ProtoPackageDetails {
  goPackage?: string;
  javaPackage?: string;
  javaOuterClassname?: string;
  javaMultipleFiles?: boolean;
  csharpNamespace?: string;
  phpNamespace?: string;
  rubyPackage?: string;
  options?: Record<string, string | number | boolean>;
}

/**
 * Resolved package state attached to a Namespace. The emitter (Phase 3) reads
 * this directly to populate the `.proto` `package` line and `option` block.
 */
export interface ProtoPackageSpec {
  name: string;
  details: ProtoPackageDetails;
}

/**
 * Marks a TypeSpec interface as a proto service. Operations declared inside the
 * interface become RPCs on the service.
 */
export function $service(context: DecoratorContext, target: Interface): void {
  context.program.stateMap(ServiceKey).set(target, true);
}

/**
 * Optional override for the emitted RPC name. Stored as the empty string when
 * no override is supplied so a `has()` check still indicates "operation is
 * RPC-tracked"; the emitter falls back to the operation's TypeSpec name when
 * the stored value is empty.
 */
export function $rpc(context: DecoratorContext, target: Operation, overrideName?: string): void {
  context.program.stateMap(RpcKey).set(target, overrideName ?? "");
}

/**
 * Suppresses the empty-request → `google.protobuf.Empty` rewrite for an
 * operation. The emitter (Phase 3) consults this flag before performing the
 * rewrite.
 */
export function $keepEmptyRequest(context: DecoratorContext, target: Operation): void {
  context.program.stateMap(KeepEmptyRequestKey).set(target, true);
}

/**
 * Declares a TypeSpec namespace as a proto package. The first argument is the
 * dotted package name (e.g. `"openlet.user.v1"`); the optional second argument
 * carries per-language options the emitter renders as `option <lang>_package`
 * statements.
 *
 * Replaces `@TypeSpec.Protobuf.package` with a slimmer surface that does not
 * require `using TypeSpec.Protobuf;`.
 */
export function $package(
  context: DecoratorContext,
  target: Namespace,
  name: string,
  details?: ProtoPackageDetails,
): void {
  const spec: ProtoPackageSpec = {
    name,
    details: details ?? {},
  };
  context.program.stateMap(PackageKey).set(target, spec);
}
