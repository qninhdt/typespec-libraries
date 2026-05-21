---
phase: 2
title: "Type mapping engine"
status: pending
priority: P1
effort: "3h"
dependencies: [phase-01]
---

# Phase 02: Type mapping engine

## Overview

Implement automatic TypeSpec-to-proto type resolution. The emitter should map builtin types, ORM scalars, and well-known types without any user annotation.

## Requirements

- Functional: All TypeSpec scalar types map to correct proto types automatically
- Functional: Well-known types (Timestamp, Duration) are imported when used
- Non-functional: Type mapping is a pure function — easy to test in isolation

## Architecture

A `resolveProtoType(program, type)` function walks the scalar chain and returns a `ProtoTypeRef` containing the proto type name and any required imports.

```typescript
interface ProtoTypeRef {
  name: string; // e.g. "int32", "string", "google.protobuf.Timestamp"
  import?: string; // e.g. "google/protobuf/timestamp.proto"
  isRepeated?: boolean; // for arrays
  isOptional?: boolean; // for optional fields
  isMap?: boolean; // for Record<K,V> → map<K,V>
  mapKey?: ProtoTypeRef;
  mapValue?: ProtoTypeRef;
}
```

## Related Code Files

- Create: `packages/typespec-protobuf/src/type-mapping.ts`
- Modify: `packages/typespec-protobuf/src/index.ts` (re-export)

## Implementation Steps

1. Create `src/type-mapping.ts` with the core mapping table:
   ```typescript
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
     decimal: { name: "string" }, // no proto decimal
     utcDateTime: { name: "google.protobuf.Timestamp", import: "google/protobuf/timestamp.proto" },
     offsetDateTime: {
       name: "google.protobuf.Timestamp",
       import: "google/protobuf/timestamp.proto",
     },
     plainDate: { name: "google.protobuf.Timestamp", import: "google/protobuf/timestamp.proto" },
     duration: { name: "google.protobuf.Duration", import: "google/protobuf/duration.proto" },
   };
   ```
2. Handle ORM custom scalars by walking `getScalarChain()`:
   - `uuid`, `text`, `email`, `url`, `ipv4`, `ipv6`, `ip`, `cidr`, `mac`, `base64`, `hostname`, `cuid`, `cuid2`, `ulid`, `nanoid`, `jwt`, `emoji` → `string`
   - `serial` → `int32`
   - `bigserial` → `int64`
   - `latitude`, `longitude` → `double`
3. Handle array types → `repeated`
4. Handle optional types → `optional` keyword
5. Handle model references → message name (qualified if cross-package)
6. Handle enum references → enum name
7. Handle `Record<string, T>` → `map<string, T>` (if feasible)
8. Collect all required imports as a side effect

## Success Criteria

- [ ] Unit tests pass for all scalar mappings
- [ ] `utcDateTime` resolves to `google.protobuf.Timestamp` with correct import
- [ ] ORM scalars (uuid, email, etc.) resolve to `string`
- [ ] Arrays resolve to `repeated`
- [ ] Optional fields resolve to `optional`

## Risk Assessment

- Medium: scalar chain walking must handle user-defined scalars that extend ORM scalars
- Mitigation: fall back to base type if custom scalar is unrecognized
