import type { Enum, Interface, Model, Namespace, Operation, Program } from "@typespec/compiler";
import { isEntity } from "@qninhdt/typespec-orm";
import { isProtoMessage, isProtoService, getProtoPackage } from "../state-accessors.js";
import type { ProtoPackageSpec } from "../decorators-service.js";
import { getQualifiedTypeName } from "../types/utils.js";

/**
 * One proto package's worth of declarations, indexed by the namespace they
 * came from. The Phase 4 cross-file work splits a single TypeSpec program
 * into multiple PackageBuckets; Phase 3 single-file mode treats the whole
 * program as one bucket.
 */
export interface PackageBucket {
  namespace: Namespace;
  spec: ProtoPackageSpec;
  /**
   * Plain `@message` models, in declaration order. Does NOT include `@entity`
   * models — those are routed through the allocator and live in `entities`.
   */
  messages: Model[];
  /**
   * `@entity` models (orm cross-emitter shorthand), in declaration order.
   * Emitted as proto messages with allocator-assigned field numbers.
   */
  entities: Model[];
  /** All enums in the namespace, in declaration order. */
  enums: Enum[];
  /** Interfaces with `@service`, in declaration order. */
  services: Interface[];
}

/**
 * Walk the program and collect every `@package` namespace plus its
 * `@message` models, `@entity` models, enums, and `@service` interfaces.
 * Visits nested namespaces below a `@package` namespace and folds them into
 * the same bucket — one `.proto` file per package, regardless of TypeSpec
 * namespace nesting depth.
 *
 * A model carrying BOTH `@entity` and `@message` is treated as an entity
 * (allocator-driven) and emitted once — it does NOT appear in `messages`.
 */
export function collectPackages(program: Program): PackageBucket[] {
  const buckets: PackageBucket[] = [];
  visit(program.getGlobalNamespaceType(), undefined);
  return buckets;

  function visit(ns: Namespace, currentBucket: PackageBucket | undefined): void {
    const pkg = getProtoPackage(program, ns);
    let bucket = currentBucket;
    if (pkg) {
      bucket = {
        namespace: ns,
        spec: pkg,
        messages: [],
        entities: [],
        enums: [],
        services: [],
      };
      buckets.push(bucket);
    }

    if (bucket) {
      for (const model of ns.models.values()) {
        // Entity wins over plain @message so a model with both is emitted once.
        if (isEntity(program, model)) {
          bucket.entities.push(model);
        } else if (isProtoMessage(program, model)) {
          bucket.messages.push(model);
        }
      }
      for (const e of ns.enums.values()) {
        bucket.enums.push(e);
      }
      for (const iface of ns.interfaces.values()) {
        if (isProtoService(program, iface)) bucket.services.push(iface);
      }
    }

    for (const child of ns.namespaces.values()) {
      visit(child, bucket);
    }
  }
}

/**
 * Apply tspconfig `include` / `exclude` filters against a list of buckets.
 * Filters match against the proto package name (e.g. `"openlet.user.v1"`).
 * Patterns are exact-match strings or `*` suffix prefixes (e.g.
 * `"openlet.user.*"`). When `include` is empty / undefined, every bucket
 * is in scope; `exclude` always wins on tie.
 */
export function filterBuckets(
  buckets: PackageBucket[],
  include?: string[],
  exclude?: string[],
): PackageBucket[] {
  const inc = include && include.length > 0 ? include : undefined;
  const exc = exclude && exclude.length > 0 ? exclude : undefined;
  return buckets.filter((b) => {
    const name = b.spec.name;
    if (exc && exc.some((p) => matches(p, name))) return false;
    if (inc && !inc.some((p) => matches(p, name))) return false;
    return true;
  });
}

function matches(pattern: string, value: string): boolean {
  if (pattern === value) return true;
  if (pattern.endsWith(".*")) {
    return value.startsWith(pattern.slice(0, -1)); // keep the trailing dot
  }
  if (pattern === "*") return true;
  return false;
}

/**
 * Walk an interface's operations in declaration order and surface each as a
 * proto RPC entry. Anonymous parameter / return models are passed through
 * verbatim — the writer turns them into anonymous-model diagnostics.
 */
export function getInterfaceOperations(iface: Interface): Operation[] {
  return Array.from(iface.operations.values());
}

/**
 * TypeSpec-namespace-qualified name of a model for diagnostics. Re-exported
 * here so writers don't need to import from `types/utils` directly.
 */
export function qualifiedName(program: Program, t: Model | Enum): string {
  return getQualifiedTypeName(program, t);
}
