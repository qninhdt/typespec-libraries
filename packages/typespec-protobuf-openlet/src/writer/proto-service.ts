import type { Interface, Model, Operation, Program } from "@typespec/compiler";
import { getDoc, isDeprecated } from "@typespec/compiler";
import { isKeepEmptyRequest, getProtoRpcOverrideName, isProtoMessage } from "../state-accessors.js";
import { getQualifiedTypeName } from "../types/utils.js";
import { renderProtoComment } from "./proto-comment.js";

export interface ServiceDiagnostic {
  code: string;
  target: Interface | Operation | Model;
  args: Record<string, string | number>;
}

export interface ServiceRenderResult {
  lines: string[];
  /** Import paths surfaced (e.g. google/protobuf/empty.proto). */
  imports: string[];
  diagnostics: ServiceDiagnostic[];
}

export interface ServiceRenderOptions {
  /** When false, suppresses empty-request → google.protobuf.Empty rewrite. */
  emptyRequestRewrite?: boolean;
}

/**
 * Render a `@service` interface as a proto service block.
 *
 * Empty-request rewrite (validation answer V4 — REQUEST ONLY): when an
 * operation's request model is empty AND the operation does not carry
 * `@keepEmptyRequest`, the request type is rewritten to
 * `google.protobuf.Empty`. Response messages preserve their named empty
 * type so authors can extend them later without a wire change.
 */
export function renderProtoService(
  program: Program,
  iface: Interface,
  opts: ServiceRenderOptions = {},
): ServiceRenderResult {
  const lines: string[] = [];
  const imports: string[] = [];
  const diagnostics: ServiceDiagnostic[] = [];
  const allowRewrite = opts.emptyRequestRewrite !== false;

  for (const line of renderProtoComment(getDoc(program, iface))) lines.push(line);
  lines.push(`service ${iface.name} {`);

  if (isDeprecated(program, iface)) {
    lines.push("  option deprecated = true;");
  }

  for (const op of iface.operations.values()) {
    const rpcName = getProtoRpcOverrideName(program, op) ?? op.name;
    const opDoc = getDoc(program, op);
    for (const line of renderProtoComment(opDoc, { indent: "  " })) lines.push(line);

    const requestRendered = renderRpcRequest(program, op, allowRewrite);
    const responseRendered = renderRpcResponse(program, op);
    if (requestRendered.diagnostic) diagnostics.push(requestRendered.diagnostic);
    if (responseRendered.diagnostic) diagnostics.push(responseRendered.diagnostic);
    if (requestRendered.import) imports.push(requestRendered.import);

    const trailingOpts = isDeprecated(program, op) ? " { option deprecated = true; }" : ";";
    lines.push(
      `  rpc ${rpcName}(${requestRendered.typeName}) returns (${responseRendered.typeName})${trailingOpts}`,
    );
  }

  lines.push("}");
  return { lines, imports, diagnostics };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface RpcArgRender {
  typeName: string;
  import?: string;
  diagnostic?: ServiceDiagnostic;
}

function renderRpcRequest(program: Program, op: Operation, allowRewrite: boolean): RpcArgRender {
  const param = op.parameters;
  const sourceModel = pickRequestModel(op);

  // Empty-request detection: zero properties on the wrapped param container.
  if (param.properties.size === 0) {
    if (isKeepEmptyRequest(program, op)) {
      // Author opted out of the rewrite — use the source model name when
      // available, fall back to Empty if there's no named source.
      if (sourceModel) {
        return { typeName: getQualifiedTypeName(program, sourceModel) };
      }
    }
    if (allowRewrite) {
      return {
        typeName: "google.protobuf.Empty",
        import: "google/protobuf/empty.proto",
      };
    }
    if (sourceModel) {
      return { typeName: getQualifiedTypeName(program, sourceModel) };
    }
    return {
      typeName: "google.protobuf.Empty",
      import: "google/protobuf/empty.proto",
    };
  }

  if (!sourceModel) {
    return {
      typeName: "google.protobuf.Any",
      diagnostic: {
        code: "anonymous-model-on-wire",
        target: op,
        args: { propertyName: "request", messageName: op.name },
      },
    };
  }
  if (!isProtoMessage(program, sourceModel)) {
    return {
      typeName: getQualifiedTypeName(program, sourceModel),
      diagnostic: {
        code: "unknown-type-fallback",
        target: op,
        args: {
          propertyName: "request",
          messageName: op.name,
          typeName: sourceModel.name ?? "anonymous",
        },
      },
    };
  }
  return { typeName: getQualifiedTypeName(program, sourceModel) };
}

function renderRpcResponse(program: Program, op: Operation): RpcArgRender {
  const ret = op.returnType;
  if (ret.kind !== "Model") {
    return {
      typeName: "google.protobuf.Any",
      diagnostic: {
        code: "unknown-type-fallback",
        target: op,
        args: {
          propertyName: "response",
          messageName: op.name,
          typeName: (ret as { kind: string }).kind ?? "unknown",
        },
      },
    };
  }
  if (!ret.name) {
    return {
      typeName: "google.protobuf.Any",
      diagnostic: {
        code: "anonymous-model-on-wire",
        target: op,
        args: { propertyName: "response", messageName: op.name },
      },
    };
  }
  return { typeName: getQualifiedTypeName(program, ret) };
}

/**
 * Pick the source model whose properties were spread into op.parameters via
 * `op.parameters: ...SourceRequest`. TypeSpec records this in sourceModels.
 */
function pickRequestModel(op: Operation): Model | undefined {
  const params = op.parameters;
  const sourceModels = (params as { sourceModels?: Array<{ model?: Model }> }).sourceModels ?? [];
  for (const src of sourceModels) {
    if (src.model && src.model.name) return src.model;
  }
  return undefined;
}
