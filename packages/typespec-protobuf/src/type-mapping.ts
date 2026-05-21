import type { Program, Type, Scalar, Model, ModelProperty } from "@typespec/compiler";
import { getScalarChain } from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "./lib.js";

export interface ProtoTypeRef {
  name: string;
  import?: string;
  isRepeated?: boolean;
  isOptional?: boolean;
}

const SCALAR_TO_PROTO: Record<string, ProtoTypeRef> = {
  string: { name: "string" },
  boolean: { name: "bool" },
  int8: { name: "int32" },
  int16: { name: "int32" },
  int32: { name: "int32" },
  int64: { name: "int64" },
  uint8: { name: "uint32" },
  uint16: { name: "uint32" },
  uint32: { name: "uint32" },
  uint64: { name: "uint64" },
  float32: { name: "float" },
  float64: { name: "double" },
  bytes: { name: "bytes" },
  decimal: { name: "string" },
  utcDateTime: { name: "google.protobuf.Timestamp", import: "google/protobuf/timestamp.proto" },
  offsetDateTime: { name: "google.protobuf.Timestamp", import: "google/protobuf/timestamp.proto" },
  plainDate: { name: "google.protobuf.Timestamp", import: "google/protobuf/timestamp.proto" },
  plainTime: { name: "string" },
  duration: { name: "google.protobuf.Duration", import: "google/protobuf/duration.proto" },
  numeric: { name: "string" },
  integer: { name: "int64" },
  float: { name: "double" },
  safeint: { name: "int64" },
  url: { name: "string" },
};

const ORM_STRING_SCALARS = new Set([
  "uuid",
  "text",
  "email",
  "ipv4",
  "ipv6",
  "ip",
  "cidr",
  "mac",
  "base64",
  "hostname",
  "cuid",
  "cuid2",
  "ulid",
  "nanoid",
  "jwt",
  "emoji",
  "jsonb",
]);

const ORM_NUMERIC_SCALARS: Record<string, ProtoTypeRef> = {
  serial: { name: "int32" },
  bigserial: { name: "int64" },
  latitude: { name: "double" },
  longitude: { name: "double" },
};

export function resolveProtoType(program: Program, type: Type): ProtoTypeRef {
  if (type.kind === "Scalar") {
    return resolveScalarType(program, type);
  }

  if (type.kind === "Model") {
    return resolveModelType(program, type);
  }

  if (type.kind === "Enum") {
    return { name: type.name };
  }

  if (type.kind === "ModelProperty") {
    return resolvePropertyType(program, type);
  }

  reportDiagnostic(program, {
    code: "proto-unsupported-type",
    target: type,
  });
  return { name: "string" };
}

function resolveScalarType(program: Program, scalar: Scalar): ProtoTypeRef {
  const chain = getScalarChain(scalar);

  for (const name of chain) {
    if (SCALAR_TO_PROTO[name]) {
      return { ...SCALAR_TO_PROTO[name] };
    }
    if (ORM_STRING_SCALARS.has(name)) {
      return { name: "string" };
    }
    if (ORM_NUMERIC_SCALARS[name]) {
      return { ...ORM_NUMERIC_SCALARS[name] };
    }
  }

  reportDiagnostic(program, {
    code: "proto-unsupported-type",
    target: scalar,
  });
  return { name: "string" };
}

function resolveModelType(program: Program, model: Model): ProtoTypeRef {
  if (model.indexer !== undefined) {
    const elementType = resolveProtoType(program, model.indexer.value);
    return { ...elementType, isRepeated: true };
  }

  if (model.name === "Array" || model.name === "") {
    const arg = model.templateMapper?.args?.[0];
    if (arg && "type" in arg && arg.type && "kind" in arg.type) {
      const elementType = resolveProtoType(program, arg.type as Type);
      return { ...elementType, isRepeated: true };
    }
    return { name: "string", isRepeated: true };
  }

  return { name: model.name };
}

function resolvePropertyType(program: Program, prop: ModelProperty): ProtoTypeRef {
  const result = resolveProtoType(program, prop.type);

  if (prop.optional && !result.isRepeated) {
    return { ...result, isOptional: true };
  }

  return result;
}

export function collectImports(types: ProtoTypeRef[]): string[] {
  const imports = new Set<string>();
  for (const type of types) {
    if (type.import) {
      imports.add(type.import);
    }
  }
  return [...imports].sort();
}
