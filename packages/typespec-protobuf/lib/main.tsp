import "./tsp-index.js";

using TypeSpec.Reflection;

namespace Openlet.Proto;

// ─── Message-level decorators ────────────────────────────────────────────────

/**
 * Marks a model as a proto message. The optional `overrideName` overrides the
 * emitted message name when the TypeSpec model name differs from the desired
 * proto identifier.
 *
 * @example
 * ```typespec
 * @message
 * model GetUserResponse {
 *   @field(1) userId: string;
 *   @field(2) displayName: string;
 * }
 * ```
 */
extern dec message(target: Model, overrideName?: valueof string);

/**
 * Pins the proto field number for a model property. Required on every emitted
 * property unless allocated by `@entity` (Phase 5).
 *
 * The value must fall between 1 and 2^29-1 inclusive and outside the
 * implementation-reserved range 19000-19999.
 *
 * #### Wire-compat note
 *
 * Field numbers are part of the wire protocol — changing one is a breaking
 * change. Treat them as load-bearing.
 *
 * @example
 * ```typespec
 * model Example {
 *   @field(1) test: string;
 * }
 * ```
 */
extern dec field(target: ModelProperty, index: valueof uint32);

/**
 * Reserves field numbers, ranges, and names. Each reservation is one of:
 *
 * - a `uint32` — reserves a field index.
 * - a `string` — reserves a field name.
 * - a tuple `[uint32, uint32]` — reserves an inclusive range of indices.
 *
 * Unlike upstream, this decorator works on both messages **and enums** — closing
 * the parity gap that lost openlet's `QuotaKind` reserved range during the
 * migration.
 *
 * @example
 * ```typespec
 * // Reserve fields 8-15 inclusive, 100, and the name "test" within a message.
 * @reserve([8, 15], 100, "test")
 * model Example {}
 *
 * // Same applies to enums.
 * @reserve([100, 199])
 * enum QuotaKind { unspecified, storage, bandwidth }
 * ```
 */
extern dec reserve(
  target: Model | Enum,
  ...reservations: valueof (string | [uint32, uint32] | uint32)[]
);

/**
 * Groups properties into a single proto `oneof` block. All properties carrying
 * `@oneof("foo")` on the same model are emitted as members of `oneof foo`.
 *
 * @example
 * ```typespec
 * @message
 * model Payload {
 *   @oneof("body") @field(1) text: string;
 *   @oneof("body") @field(2) bytesPayload: bytes;
 * }
 * ```
 */
extern dec oneof(target: ModelProperty, name: valueof string);

// ─── Service-level decorators ────────────────────────────────────────────────

/**
 * Marks a TypeSpec interface as a proto service. The interface's operations
 * become the service's RPCs.
 *
 * **Name collision:** the TypeSpec core library also exports `@service` (it
 * marks an API service title and is always in scope). Bare `@service` is
 * therefore ambiguous — qualify as `@Openlet.Proto.service`.
 *
 * @example
 * ```typespec
 * @Openlet.Proto.service
 * interface UserService {
 *   getUser(...GetUserRequest): GetUserResponse;
 * }
 * ```
 */
extern dec service(target: Interface);

/**
 * Optional override for the emitted RPC name. By default the operation's name
 * is used verbatim.
 */
extern dec rpc(target: Operation, overrideName?: valueof string);

/**
 * Suppresses the default empty-request → `google.protobuf.Empty` rewrite for an
 * operation. Use this when you want the request type to remain a named empty
 * message (e.g. for forward-compatible field additions).
 */
extern dec keepEmptyRequest(target: Operation);

/**
 * Details applied to a proto package definition.
 */
model PackageDetails {
  /**
   * The Go package import path emitted as `option go_package`. Equivalent to
   * configuring `managed.go_package_prefix` in `buf.yaml`, but explicit here
   * so the emitted `.proto` is self-contained.
   */
  goPackage?: string;

  /**
   * The Java package emitted as `option java_package`.
   */
  javaPackage?: string;

  /**
   * The Java outer classname emitted as `option java_outer_classname`.
   */
  javaOuterClassname?: string;

  /**
   * Whether to emit `option java_multiple_files = true`.
   */
  javaMultipleFiles?: boolean;

  /**
   * The C# namespace emitted as `option csharp_namespace`.
   */
  csharpNamespace?: string;

  /**
   * The PHP namespace emitted as `option php_namespace`.
   */
  phpNamespace?: string;

  /**
   * The Ruby package emitted as `option ruby_package`.
   */
  rubyPackage?: string;

  /**
   * Free-form additional options passed verbatim. Useful for emitter-specific
   * options not yet first-classed above.
   */
  options?: Record<string | boolean | numeric>;
}

/**
 * Declares that a TypeSpec namespace constitutes a proto package. The contents
 * of the namespace emit to `<package_path>/v<N>.proto` by default (e.g. package
 * `openlet.user.v1` → `openlet/user/v1.proto`).
 *
 * Replaces `@TypeSpec.Protobuf.package`.
 *
 * @example
 * ```typespec
 * @package("openlet.user.v1", { goPackage: "github.com/openlet/user-service/proto/gen/go/openlet/user/v1" })
 * namespace Openlet.UserProto;
 * ```
 */
extern dec `package`(target: Namespace, name: valueof string, details?: valueof PackageDetails);

// ─── Field-level decorators ──────────────────────────────────────────────────

/**
 * Drops a property from proto emit. The allocator (Phase 5) auto-reserves the
 * dropped field number so it can never be silently reused.
 *
 * **Name collision:** when both `using Qninhdt.Orm;` and `using Openlet.Proto;`
 * are in scope, bare `@ignore` is ambiguous — qualify as `@Openlet.Proto.ignore`.
 */
extern dec ignore(target: ModelProperty);

/**
 * Overrides the auto-generated snake_case proto field name. Use for cases where
 * the default snake_case algorithm produces an unwanted result.
 *
 * @example
 * ```typespec
 * model Example {
 *   @rename("oauth2_id_token") @field(1) oauth2IDToken: string;
 * }
 * ```
 */
extern dec rename(target: ModelProperty, name: valueof string);

/**
 * Overrides the Go binding type for a proto field. Primarily useful for
 * `bytes` or `jsonb` properties where a typed Go struct is preferred over the
 * default `[]byte` / `[]byte` (jsonb).
 *
 * The argument is a fully-qualified Go import path + symbol name, separated by
 * a dot, e.g. `"github.com/openlet/file-service/internal/file.Metadata"`.
 *
 * Mirrors `@goType` in `@qninhdt/typespec-orm`.
 */
extern dec goType(target: ModelProperty, importPathAndType: valueof string);

/**
 * Forces `map<K, V>` emission over a model property when the type alone does
 * not unambiguously resolve to a proto map (e.g. `Record<string>` whose value
 * type is a composite). Both `key` and `value` are proto type names rendered
 * verbatim.
 *
 * @example
 * ```typespec
 * model Example {
 *   @map("string", "openlet.user.v1.UserSettings") @field(1) bag: Record<UserSettings>;
 * }
 * ```
 */
extern dec map(target: ModelProperty, key: valueof string, value: valueof string);
