---
phase: 4
title: "gRPC service & streaming support"
status: pending
priority: P1
effort: "3h"
dependencies: [phase-01]
---

# Phase 04: gRPC service & streaming support

## Overview

Implement gRPC service definition rendering from TypeSpec interfaces. Support all streaming modes: unary, client streaming, server streaming, and bidirectional streaming.

## Requirements

- Functional: `@protoService` interfaces emit as `service` blocks in proto
- Functional: Interface operations emit as `rpc` methods
- Functional: `@stream(StreamMode.In)` → `stream` on request type
- Functional: `@stream(StreamMode.Out)` → `stream` on response type
- Functional: `@stream(StreamMode.Duplex)` → `stream` on both
- Functional: Operation parameters are auto-wrapped into a request message if not already a single model
- Non-functional: Clean proto3 service syntax output

## Architecture

```typescript
interface ProtoService {
  name: string;
  methods: ProtoRpcMethod[];
}

interface ProtoRpcMethod {
  name: string;
  inputType: string; // message name
  outputType: string; // message name
  clientStreaming: boolean;
  serverStreaming: boolean;
}
```

Operation resolution:

- `op foo(...FooRequest): FooResponse` → `rpc Foo(FooRequest) returns (FooResponse)`
- `op foo(a: string, b: int32): FooResponse` → auto-generate `FooRequest` message with fields a, b
- Spread params (`...Model`) → use that model directly as the request type

## Related Code Files

- Create: `packages/typespec-protobuf/src/proto-service.ts`
- Modify: `packages/typespec-protobuf/src/decorators.ts` (stream decorator reads StreamMode enum)
- Modify: `packages/typespec-protobuf/src/index.ts` (re-export)

## Implementation Steps

1. Implement `resolveProtoService(program, iface)` in `src/proto-service.ts`:
   - Iterate interface operations
   - For each operation, resolve input/output types
   - Check for `@stream` decorator and determine streaming mode
   - Build `ProtoRpcMethod` list
2. Implement request message auto-generation:
   - If operation has spread params (`...Model`), use that model
   - If operation has multiple params, synthesize a request message named `{MethodName}Request`
   - If operation has no params, use `google.protobuf.Empty`
3. Implement response handling:
   - If return type is a model, use it directly
   - If return type is `void`, use `google.protobuf.Empty`
4. Handle streaming annotation:
   - Read `@stream` state from program stateMap
   - Map `StreamMode.In` → clientStreaming=true
   - Map `StreamMode.Out` → serverStreaming=true
   - Map `StreamMode.Duplex` → both=true
5. Proto rendering for service block:
   ```proto
   service FooService {
     rpc Bar(BarRequest) returns (BarResponse);
     rpc StreamUpload(stream UploadChunk) returns (UploadReceipt);
     rpc WatchEvents(WatchRequest) returns (stream Event);
     rpc Chat(stream ChatMessage) returns (stream ChatMessage);
   }
   ```

## Success Criteria

- [ ] Simple unary RPC renders correctly
- [ ] Client streaming (`StreamMode.In`) adds `stream` to request
- [ ] Server streaming (`StreamMode.Out`) adds `stream` to response
- [ ] Bidirectional (`StreamMode.Duplex`) adds `stream` to both
- [ ] Spread params resolve to the spread model
- [ ] Multi-param operations auto-generate request messages
- [ ] `void` return maps to `google.protobuf.Empty`

## Risk Assessment

- Medium: auto-generating request messages must not collide with user-defined messages
- Mitigation: check for name collisions and emit diagnostic if found
