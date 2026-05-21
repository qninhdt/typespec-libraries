import type { Interface, Operation, Program } from "@typespec/compiler";
import { ProtoServiceKey, StreamKey } from "./lib.js";
import { resolveProtoType, type ProtoTypeRef } from "./type-mapping.js";

export interface ProtoRpcMethod {
  name: string;
  inputType: string;
  outputType: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
  inputImports: ProtoTypeRef[];
  outputImports: ProtoTypeRef[];
}

export interface ProtoService {
  name: string;
  methods: ProtoRpcMethod[];
}

export function isProtoService(program: Program, iface: Interface): boolean {
  return program.stateMap(ProtoServiceKey).has(iface);
}

export function resolveProtoService(program: Program, iface: Interface): ProtoService {
  const methods: ProtoRpcMethod[] = [];

  for (const [, op] of iface.operations) {
    methods.push(resolveRpcMethod(program, op));
  }

  return { name: iface.name, methods };
}

function resolveRpcMethod(program: Program, op: Operation): ProtoRpcMethod {
  const streamMode = program.stateMap(StreamKey).get(op) as string | undefined;

  const clientStreaming = streamMode === "In";
  const serverStreaming = streamMode === "Out";
  const duplex = streamMode === "Duplex";

  const inputType = resolveInputType(program, op);
  const outputType = resolveOutputType(program, op);

  return {
    name: capitalize(op.name),
    inputType: inputType.name,
    outputType: outputType.name,
    clientStreaming: clientStreaming || duplex,
    serverStreaming: serverStreaming || duplex,
    inputImports: inputType.imports,
    outputImports: outputType.imports,
  };
}

interface ResolvedRpcType {
  name: string;
  imports: ProtoTypeRef[];
}

function resolveInputType(_program: Program, op: Operation): ResolvedRpcType {
  const params = op.parameters;
  const properties = [...params.properties.values()];

  if (properties.length === 0) {
    return {
      name: "google.protobuf.Empty",
      imports: [{ name: "google.protobuf.Empty", import: "google/protobuf/empty.proto" }],
    };
  }

  if (properties.length === 1 && properties[0].type.kind === "Model") {
    const model = properties[0].type;
    if (model.name && model.name !== "Array") {
      return { name: model.name, imports: [] };
    }
  }

  if (params.sourceModels && params.sourceModels.length > 0) {
    const sourceModel = params.sourceModels[0].model;
    if (sourceModel.name) {
      return { name: sourceModel.name, imports: [] };
    }
  }

  if (params.name) {
    return { name: params.name, imports: [] };
  }

  return { name: `${capitalize(op.name)}Request`, imports: [] };
}

function resolveOutputType(program: Program, op: Operation): ResolvedRpcType {
  const returnType = op.returnType;

  if (returnType.kind === "Intrinsic" && returnType.name === "void") {
    return {
      name: "google.protobuf.Empty",
      imports: [{ name: "google.protobuf.Empty", import: "google/protobuf/empty.proto" }],
    };
  }

  if (returnType.kind === "Model" && returnType.name) {
    return { name: returnType.name, imports: [] };
  }

  const resolved = resolveProtoType(program, returnType);
  return { name: resolved.name, imports: resolved.import ? [resolved] : [] };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
