---
phase: 6
title: "Tests & example integration"
status: pending
priority: P2
effort: "3h"
dependencies: [phase-05]
---

# Phase 06: Tests & example integration

## Overview

Write unit tests for each module and integrate the emitter into the file-vault example to replace `@typespec/protobuf` usage. Update the example to use the cleaner syntax (no `@field(N)`).

## Requirements

- Functional: Unit tests cover type mapping, enum mapping, service resolution
- Functional: Integration test compiles a full schema and verifies proto output
- Functional: File-vault example updated to use `@qninhdt/typespec-protobuf`
- Non-functional: Tests run in CI alongside other packages

## Architecture

Tests use the same vitest + TypeSpec test runner pattern as other packages.

## Related Code Files

- Create: `packages/typespec-protobuf/test/type-mapping.test.ts`
- Create: `packages/typespec-protobuf/test/enum-mapping.test.ts`
- Create: `packages/typespec-protobuf/test/service-resolution.test.ts`
- Create: `packages/typespec-protobuf/test/emitter-integration.test.ts`
- Create: `packages/typespec-protobuf/test/schemas/` (test .tsp files)
- Modify: `examples/file-vault/identity/data.tsp` (remove `@field(N)`)
- Modify: `examples/file-vault/identity/service.tsp` (use `@protoService` from new package)
- Modify: `examples/file-vault/*/service.tsp` (all service files)
- Modify: `examples/file-vault/*/data.tsp` (all data files)
- Modify: `examples/file-vault/main.tsp` (import new package)
- Modify: root `package.json` (add compile script for proto output)

## Implementation Steps

1. Write unit tests for `type-mapping.ts`:
   - Test each scalar mapping
   - Test array → repeated
   - Test optional → optional
   - Test model reference resolution
   - Test unknown scalar fallback
2. Write unit tests for `enum-mapping.ts`:
   - Test numeric enum passthrough
   - Test string enum auto-numbering
   - Test missing zero value diagnostic
   - Test UPPER_SNAKE_CASE conversion
3. Write unit tests for `proto-service.ts`:
   - Test unary RPC
   - Test all streaming modes
   - Test spread params resolution
   - Test auto-generated request messages
4. Write integration test:
   - Compile a multi-service schema
   - Verify output matches expected `.proto` content
   - Verify imports are correct
5. Update file-vault example:
   - Replace `import "@typespec/protobuf"` with `import "@qninhdt/typespec-protobuf"`
   - Replace `using TypeSpec.Protobuf` with `using Qninhdt.Proto`
   - Remove all `@field(N)` annotations from data models
   - Replace `@TypeSpec.Protobuf.package(...)` with `@protoPackage(...)`
   - Replace `@TypeSpec.Protobuf.service` with `@protoService`
   - Keep `@stream(StreamMode.In/Out)` (same decorator name)
   - Remove `TypeSpec.Protobuf.WellKnown.Timestamp` references → use `utcDateTime` directly
6. Add emitter to `tspconfig.yaml` for file-vault example
7. Run `pnpm run compile-example:file-vault` and verify proto output
8. Check in generated proto files under `outputs/file-vault/proto/`

## Success Criteria

- [ ] All unit tests pass
- [ ] Integration test produces valid proto output
- [ ] File-vault example compiles with new emitter
- [ ] Generated proto files are checked in under `outputs/`
- [ ] No `@field(N)` annotations remain in example data models
- [ ] CI passes (build + test + example compilation)

## Risk Assessment

- Low: test patterns are well-established in this repo
- Medium: updating all file-vault data/service files is mechanical but touches many files
- Mitigation: can be done with find-and-replace patterns
