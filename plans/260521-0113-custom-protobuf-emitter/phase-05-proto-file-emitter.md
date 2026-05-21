---
phase: 5
title: "Proto file emitter"
status: pending
priority: P1
effort: "4h"
dependencies: [phase-02, phase-03, phase-04]
---

# Phase 05: Proto file emitter

## Overview

The main emitter that orchestrates type mapping, enum rendering, service rendering, and outputs valid `.proto` files. Handles file splitting by package, import collection, and message ordering.

## Requirements

- Functional: Emit valid proto3 `.proto` files
- Functional: One file per `@protoPackage` namespace
- Functional: Auto-collect and deduplicate imports (well-known types, cross-package refs)
- Functional: Messages ordered topologically (dependencies before dependents)
- Functional: Support `include`/`exclude` selectors (same as other emitters)
- Non-functional: Output matches `protoc` formatting conventions

## Architecture

The emitter follows the same pattern as `typespec-dbml`:

1. Read ORM graph via `normalizeOrmGraph` + `selectModelsForEmitter`
2. Group models by proto package (from `@protoPackage` on namespace)
3. For each package, render a `.proto` file containing:
   - `syntax = "proto3";`
   - `package {name};`
   - `import` statements (well-known types + cross-package)
   - `enum` definitions
   - `message` definitions
   - `service` definitions

File output structure:

```
{output-dir}/
├── filevault/identity/v1/identity.proto
├── filevault/storage/v1/storage.proto
└── filevault/shared/v1/shared.proto
```

The path is derived from the package name: `filevault.identity.v1` → `filevault/identity/v1/`.
The filename is the last segment of the package name (or the namespace leaf).

## Related Code Files

- Create: `packages/typespec-protobuf/src/proto-emitter.ts`
- Modify: `packages/typespec-protobuf/src/index.ts` (export `$onEmit`)
- Modify: `packages/typespec-protobuf/src/lib.ts` (emitter options)

## Implementation Steps

1. Define emitter options in `src/lib.ts`:
   ```typescript
   interface ProtoEmitterOptions {
     "output-dir"?: string;
     include?: string[];
     exclude?: string[];
   }
   ```
2. Create `src/proto-emitter.ts` with `emit(context)` function:
   - Call `normalizeOrmGraph(program)` to get all models
   - Collect all namespaces with `@protoPackage` decorator
   - For each package namespace:
     a. Collect all data models (non-table models) in that namespace
     b. Collect all enums referenced by those models
     c. Collect all interfaces with `@protoService`
     d. Resolve all type references and collect imports
     e. Render proto file content
3. Implement message rendering:
   - Auto-number fields sequentially (1-based, by declaration order)
   - Check for `@protoField(n)` override
   - Handle nested messages (model properties that reference other models)
   - Handle `oneof` if a property is a union type (stretch goal)
4. Implement import resolution:
   - Track which well-known types are used → add imports
   - Track cross-package message references → add imports
   - Deduplicate imports
5. Implement file writing:
   - Use `@alloy-js/core` render/writeOutput OR plain string concatenation + `fs.writeFile`
   - Decision: use plain string output (proto is simple text, no need for JSX tree)
6. Handle the `go_package` option:
   - Derive from package name or allow user override via emitter option

## Success Criteria

- [ ] Emitter produces valid `.proto` files that pass `protoc --lint`
- [ ] Well-known type imports are auto-added when Timestamp/Duration/Empty used
- [ ] Cross-package imports resolve correctly
- [ ] Field numbers are auto-assigned sequentially
- [ ] `@protoField(n)` override works
- [ ] Services render after messages in the file
- [ ] Output directory structure matches package name

## Risk Assessment

- Medium: topological ordering of messages (circular references)
- Mitigation: proto allows forward references, so ordering is cosmetic not functional
- Medium: cross-package import paths must be correct
- Mitigation: derive from package name consistently
