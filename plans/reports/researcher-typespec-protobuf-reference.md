# TypeSpec Protobuf Reference Implementation Research

**Date:** 2026-05-21
**Purpose:** Understand @typespec/protobuf for custom protobuf emitter development

---

## 1. Decorators Overview

The library provides these decorators in `namespace TypeSpec.Protobuf`:

| Decorator       | Target        | Purpose                                                                    |
| --------------- | ------------- | -------------------------------------------------------------------------- |
| `@package`      | Namespace     | Declares a namespace as a Protobuf package (one .proto file per namespace) |
| `@service`      | Interface     | Declares an interface as a Protobuf `service`                              |
| `@message`      | Model         | Forces model to be emitted as a message                                    |
| `@field(index)` | ModelProperty | Assigns field index (1 to 2^29-1, excludes 19000-19999)                    |
| `@reserve(...)` | Model         | Reserves field indices/names to prevent future collisions                  |
| `@stream(mode)` | Operation     | Sets gRPC streaming mode                                                   |

### PackageDetails

```typespec
model PackageDetails {
  name?: string;                    // Package name (default: namespace path)
  options?: Record<string | boolean | numeric>;  // Protobuf options
}
```

---

## 2. Type Mappings (TypeSpec → Protobuf)

### Scalar Types

| TypeSpec   | Protobuf   | Notes                          |
| ---------- | ---------- | ------------------------------ |
| `string`   | `string`   |                                |
| `boolean`  | `bool`     |                                |
| `int32`    | `int32`    |                                |
| `int64`    | `int64`    |                                |
| `uint32`   | `uint32`   |                                |
| `uint64`   | `uint64`   |                                |
| `float32`  | `float`    |                                |
| `float64`  | `double`   |                                |
| `bytes`    | `bytes`    |                                |
| `sint32`   | `sint32`   | Custom, variable-length signed |
| `sint64`   | `sint64`   | Custom, variable-length signed |
| `sfixed32` | `sfixed32` | Custom, fixed 4-byte signed    |
| `sfixed64` | `sfixed64` | Custom, fixed 8-byte signed    |
| `fixed32`  | `fixed32`  | Custom, fixed 4-byte unsigned  |
| `fixed64`  | `fixed64`  | Custom, fixed 8-byte unsigned  |

### Complex Types

| TypeSpec   | Protobuf                | Notes                                                            |
| ---------- | ----------------------- | ---------------------------------------------------------------- |
| Model      | `message`               | Must have `@field` on all properties OR be referenced by service |
| Enum       | `enum`                  | Must have explicit integer values, first must be 0               |
| Array      | `repeated` field        | Nested arrays not supported                                      |
| `Map<K,V>` | `map<K,V>`              | K must be integral or string                                     |
| `unknown`  | `google.protobuf.Any`   | Via WellKnown types                                              |
| `void`     | `google.protobuf.Empty` | Via WellKnown types                                              |

### Implementation Details (transform/index.ts)

```typescript
function getProtoScalarsMap(program: Program): Map<Type, ProtoScalar> {
  const entries = [
    [program.resolveTypeReference("TypeSpec.bytes"), scalar("bytes")],
    [program.resolveTypeReference("TypeSpec.boolean"), scalar("bool")],
    [program.resolveTypeReference("TypeSpec.string"), scalar("string")],
    [program.resolveTypeReference("TypeSpec.int32"), scalar("int32")],
    // ... etc
  ];
}
```

The mapping uses a WeakMap cache keyed by Program for performance.

---

## 3. Enum Handling

**Requirements:**

1. Every enum member must have an explicit integer value
2. First member must be 0

**Alias Support:**

- If enum has duplicate values, emits `option allow_alias = true;`

**Example input:**

```typespec
enum InputTypeWithAlias {
  BAZ: 0,
  QUX: 1,
  FUZ: 1,  // Duplicate value triggers allow_alias
}
```

**Output:**

```protobuf
enum InputTypeWithAlias {
  option allow_alias = true;
  BAZ = 0;
  QUX = 1;
  FUZ = 1;
}
```

**Validation (transform/index.ts:135-165):**

```typescript
if (
  members.some(({ value: v }) => v === undefined || typeof v !== "number" || !Number.isInteger(v))
) {
  reportDiagnostic(program, { code: "unconvertible-enum", target: e });
}

if (members[0].value !== 0) {
  reportDiagnostic(program, {
    code: "unconvertible-enum",
    messageId: "no-zero-first",
    target: members[0],
  });
}
```

---

## 4. gRPC Streaming

### StreamMode Enum

```typescript
enum StreamMode {
  Duplex = 3, // Both input and output streaming
  In = 2, // Client streaming
  Out = 1, // Server streaming
  None = 0, // No streaming (default)
}
```

### Usage

```typespec
@stream(StreamMode.Out)
op logs(...LogsRequest): LogEvent;

@stream(StreamMode.Duplex)
op connectToMessageService(...Message): Message;
```

### Protobuf Output

```protobuf
service Service {
  rpc Duplex(stream Input) returns (stream Output);
  rpc In(stream Input) returns (Output);
  rpc Out(Input) returns (stream Output);
  rpc None(Input) returns (Output);
}
```

### Implementation

```typescript
export const $stream: StreamDecorator = (ctx, target, mode) => {
  const emitStreamingMode = {
    Duplex: StreamingMode.Duplex,
    In: StreamingMode.In,
    Out: StreamingMode.Out,
    None: StreamingMode.None,
  }[(mode as any).name as string];

  ctx.program.stateMap(state.stream).set(target, emitStreamingMode);
};
```

Streaming is stored in program state and applied during method emission (transform/index.ts:284-311):

```typescript
function toMethodFromOperation(operation: Operation): ProtoMethodDeclaration {
  const streamingMode = program.stateMap(state.stream).get(operation) ?? StreamingMode.None;
  // ...
  return {
    kind: "method",
    stream: streamingMode,
    // ...
  };
}
```

---

## 5. Architecture Overview

```
packages/protobuf/
├── lib/
│   └── proto.tsp              # Decorator definitions (main.tsp equivalent)
├── src/
│   ├── index.ts               # Entry point + decorator implementations
│   ├── lib.ts                 # Options, diagnostics, state symbols
│   ├── proto.ts               # Decorator parameter types, helper functions
│   ├── ast.ts                 # ProtoFile AST definitions
│   ├── transform/
│   │   └── index.ts           # Main conversion logic (TypeSpec → AST)
│   └── write.ts               # AST → .proto text emission
├── test/
│   └── scenarios/             # Test cases
│       ├── streams/
│       ├── enum/
│       ├── map/
│       └── ...
└── package.json
```

### Flow

```
TypeSpec Program
    ↓
createProtobufEmitter()  [transform/index.ts]
    ↓
tspToProto()  →  ProtoFile[]
    ↓
writeProtoFile()  [write.ts]
    ↓
.proto text files
```

### Key State Symbols (lib.ts)

```typescript
const keys = [
  "fieldIndex", // ModelProperty → number
  "package", // Namespace → PackageDetails
  "service", // Interface → (mark only)
  "externRef", // Model → [path, protoName]
  "stream", // Operation → StreamingMode
  "reserve", // Model → Reservation[]
  "message", // Model → (mark only)
  "_map", // Model → (mark only)
] as const;
```

---

## 6. main.tsp (lib/proto.tsp) Full Content

```typespec
import "../dist/src/tsp-index.js";

namespace TypeSpec.Protobuf;

// Extern model for cross-file references
model Extern<Path extends string, Name extends string> {
  _extern: never;
}

// Well-known types
namespace WellKnown {
  model Empty is Extern<"google/protobuf/empty.proto", "google.protobuf.Empty">;
  model Timestamp is Extern<"google/protobuf/timestamp.proto", "google.protobuf.Timestamp">;
  model Any is Extern<"google/protobuf/any.proto", "google.protobuf.Any">;
  model LatLng is Extern<"google/type/latlng.proto", "google.type.LatLng">;
}

// Custom scalars
scalar sint32 extends int32;
scalar sint64 extends int64;
scalar sfixed32 extends int32;
scalar sfixed64 extends int64;
scalar fixed32 extends uint32;
scalar fixed64 extends uint64;

// Map type
@Private._map
model Map<Key extends integral | string, Value> {}

// Decorators
extern dec message(target: {});
extern dec field(target: ModelProperty, index: valueof uint32);
extern dec reserve(target: {}, ...reservations: valueof (string | [uint32, uint32] | uint32)[]);
extern dec service(target: Interface);
extern dec `package`(target: Namespace, details?: PackageDetails);

enum StreamMode { Duplex, In, Out, None }
extern dec stream(target: Operation, mode: StreamMode);

namespace Private {
  extern dec externRef(target: Model, path: string, name: string);
  extern dec _map(target: Model);
}
```

---

## 7. Key Design Patterns

### Message Detection

A model is automatically a message if:

1. All properties have `@field` decorator, OR
2. Model is referenced by a service operation

For explicit control: `@message` decorator forces emission.

### Field Index Validation

```typescript
const MAX_FIELD_INDEX = 2 ** 29 - 1;
const IMPLEMENTATION_RESERVED_RANGE = [19000, 19999];

// Must be: 1 <= index <= 2^29-1, not in 19000-19999
export const $field: FieldDecorator = (ctx, target, fieldIndex) => {
  // ... validation checks
};
```

### Cross-Package References

When a type in package A references a model in package B:

1. Add import statement for B's .proto file
2. Use fully-qualified name (package.name.TypeName)

Handled by `addImportSourceForProtoIfNeeded()` (transform/index.ts:948-1039).

### Reservation System

```typescript
@reserve([8, 15], 100, "test")  // Range, single index, name
model Example { }
```

Emitter validates that:

- No field uses a reserved index/name
- Field indices don't collide with reservations

---

## 8. Important Diagnostics

| Code                               | Severity | Message                          |
| ---------------------------------- | -------- | -------------------------------- |
| `field-index:missing`              | error    | Field lacks `@field` decorator   |
| `field-index:invalid`              | error    | Index not positive integer       |
| `field-index:out-of-bounds`        | error    | Index > 2^29-1                   |
| `field-index:reserved`             | error    | Index in 19000-19999             |
| `unconvertible-enum`               | error    | Enum missing explicit int values |
| `unconvertible-enum:no-zero-first` | error    | First enum value != 0            |
| `anonymous-model`                  | error    | Anonymous models not supported   |
| `nested-array`                     | error    | Arrays of arrays not allowed     |
| `unsupported-intrinsic`            | error    | Unknown intrinsic type           |
| `union`                            | error    | Unions not supported in messages |

---

## 9. Emitter Options

```typescript
interface ProtobufEmitterOptions {
  noEmit?: boolean; // Validate only, don't write files
  "omit-unreachable-types"?: boolean; // Only emit @message or reachable types
}
```

---

## 10. Test Scenarios (36 total)

Key scenarios demonstrating features:

- **streams**: All 4 streaming modes (Duplex, In, Out, None)
- **enum**: Explicit values, alias handling
- **enum-nonintegral**: Rejects non-integer values
- **enum-nozero**: Rejects first value != 0
- **map**: Protobuf map<K,V> generation
- **extern**: Cross-file references with imports
- **reserved fields**: Index and name reservation
- **options**: Package-level Protobuf options
- **omit**: omit-unreachable-types option behavior

---

## Summary for Custom Emitter Development

1. **Use state maps/sets** to store decorator data (program.stateMap/set)
2. **AST pattern**: Define clean interfaces (ProtoFile, ProtoMessage, etc.)
3. **Two-phase emit**: Transform → Write (separation of concerns)
4. **Validation first**: Report errors early, prevent invalid output
5. **Streaming via state**: Store streaming mode on operations, apply during service emit
6. **Cross-file refs**: Track imports and use fully-qualified names
7. **Custom scalars**: Extend base types with additional constraints

---

**Status:** DONE
**Concerns:** None
