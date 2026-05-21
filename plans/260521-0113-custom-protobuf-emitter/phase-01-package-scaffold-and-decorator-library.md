---
phase: 1
title: "Package scaffold & decorator library"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 01: Package scaffold & decorator library

## Overview

Create the `@qninhdt/typespec-protobuf` package with its own `lib/main.tsp` defining proto-specific decorators. This package is independent from `typespec-orm` but can read ORM state.

## Requirements

- Functional: Package compiles, decorators are recognized by the TypeSpec compiler
- Non-functional: Follow existing package conventions (alloy build, vitest, same tsconfig patterns)

## Architecture

The decorator library defines a `Qninhdt.Proto` namespace with decorators for proto-specific concerns. It does NOT reuse or modify `Qninhdt.Orm`.

## Related Code Files

- Create: `packages/typespec-protobuf/package.json`
- Create: `packages/typespec-protobuf/tsconfig.json`
- Create: `packages/typespec-protobuf/tsconfig.build.json`
- Create: `packages/typespec-protobuf/vitest.config.ts`
- Create: `packages/typespec-protobuf/lib/main.tsp`
- Create: `packages/typespec-protobuf/lib/tsp-index.js`
- Create: `packages/typespec-protobuf/src/index.ts`
- Create: `packages/typespec-protobuf/src/lib.ts`
- Create: `packages/typespec-protobuf/src/decorators.ts`
- Create: `packages/typespec-protobuf/src/testing/index.ts`

## Implementation Steps

1. Create `packages/typespec-protobuf/` directory structure
2. Write `package.json` following the DBML emitter pattern:
   - name: `@qninhdt/typespec-protobuf`
   - tspMain: `lib/main.tsp`
   - peer deps: `@typespec/compiler`
   - workspace dep: `@qninhdt/typespec-orm`
   - build script: `tsc -p tsconfig.build.json` (no alloy needed — no JSX components for proto text output)
3. Write `lib/main.tsp` with decorators:

   ```tsp
   import "./tsp-index.js";
   using TypeSpec.Reflection;
   namespace Qninhdt.Proto;

   // Stream modes for gRPC
   enum StreamMode { In, Out, Duplex }

   // Package decorator — sets proto package name
   extern dec protoPackage(target: Namespace, name: valueof string);

   // Service decorator — marks interface as gRPC service
   extern dec protoService(target: Interface);

   // Stream decorator — marks an operation as streaming
   extern dec stream(target: Operation, mode: StreamMode);

   // Optional field number override (NOT required — auto-numbered by default)
   extern dec protoField(target: ModelProperty, number: valueof int32);

   // Import external proto files
   extern dec protoImport(target: Namespace, path: valueof string);

   // Map a model to a specific well-known proto message
   extern dec protoMap(target: Model, protoType: valueof string);
   ```

4. Write `lib/tsp-index.js` — standard JS entrypoint
5. Write `src/lib.ts` — `createTypeSpecLibrary` with emitter options schema and diagnostics
6. Write `src/decorators.ts` — decorator implementations storing state via `program.stateMap`
7. Write `src/index.ts` — re-exports, `$decorators` map under `"Qninhdt.Proto"` namespace
8. Write `src/testing/index.ts` — test helper for creating test runners
9. Write tsconfig files matching existing packages
10. Run `pnpm install` and `pnpm run build` in the package to verify compilation

## Success Criteria

- [ ] `pnpm run build` succeeds in `packages/typespec-protobuf`
- [ ] TypeSpec compiler recognizes decorators from `lib/main.tsp`
- [ ] A minimal `.tsp` file using `@protoPackage` and `@protoService` compiles without errors

## Risk Assessment

- Low risk: follows established patterns from other packages in this repo
- Ensure `tspMain` field in package.json points correctly to `lib/main.tsp`
