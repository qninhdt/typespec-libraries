---
phase: 2
title: "Strict Diagnostics by Default"
status: pending
priority: P0
effort: "5h"
dependencies: [phase-01]
---

# Phase 2: Strict Diagnostics by Default

## Overview

Make production safety the default for owned emitters: unsupported types, skipped fields, dropped relation semantics, and inert options must fail instead of warning or silently degrading output.

## Requirements

- Functional: strict behavior is default across owned supported emitters.
- Functional: every declared diagnostic in owned packages is either emitted or removed.
- Functional: lossy generation paths are errors by default.
- Functional: upstream Protobuf schemas rely on upstream `@field(number)` diagnostics rather than local custom emitter diagnostics.
- Non-functional: tests must assert failure modes, not just happy paths.

## Architecture

Do not implement a broad compatibility layer. Add minimal shared helpers where useful, but keep each emitter's diagnostics local to its failure mode. Protobuf strictness is validated through upstream `@typespec/protobuf` compilation and schema tests, not by forking the emitter.

## Related Code Files

- Modify: `packages/typespec-orm/src/lib.ts`
- Modify: `packages/typespec-orm/src/emitter-bootstrap.ts`
- Modify: `packages/typespec-ent/src/lib.ts`
- Modify: `packages/typespec-ent/src/components/EntSchema.tsx`
- Modify: `packages/typespec-sqlmodel/src/lib.ts`
- Modify: `packages/typespec-sqlmodel/src/components/**`
- Modify: `packages/typespec-zod/src/lib.ts`
- Modify: `packages/typespec-zod/src/zod-base-schema.tsx`
- Modify: `packages/typespec-dbml/src/lib.ts`
- Modify: `packages/typespec-dbml/src/components/DbmlColumn.tsx`
- Modify: tests under owned packages
- Modify: Protobuf example/schema tests that compile with upstream `@typespec/protobuf`

## Implementation Steps

1. Inventory diagnostics in each owned package `src/lib.ts` and map them to actual `reportDiagnostic` calls.
2. Remove diagnostics with no valid runtime scenario.
3. Change unsupported-type diagnostics to `error` in Ent, SQLModel, Zod, and DBML.
4. Replace fallback behaviors:
   - Ent: no silent field skip.
   - SQLModel: no fake dialect fallback or unmapped field fallback.
   - Zod: no `z.any()` for unknown types.
   - DBML: no empty column line for unknown types.
5. Do not add local Protobuf fallback behavior; fix schemas to compile under upstream `@typespec/protobuf`.
6. Add IO write error handling where missing in owned emitters.
7. Add negative tests that compile invalid schemas and assert diagnostics.
8. Add or keep Protobuf schema tests proving missing `@field(number)` fails under upstream `@typespec/protobuf`.
9. Update READMEs: strict is default; users must fix schemas instead of accepting degraded output.

## Success Criteria

- [ ] Unsupported type in each owned emitter fails compilation.
- [ ] Missing Protobuf field numbers fail through upstream `@typespec/protobuf` compilation.
- [ ] No declared diagnostic remains unused without documented reason.
- [ ] No supported owned emitter silently omits fields/columns/messages.
- [ ] IO write failures report `emit-write-failed` or package equivalent.
- [ ] Tests cover at least one strict failure per owned emitter plus upstream Protobuf field-number failure.

## Risk Assessment

- High: this is intentionally breaking. Mitigate by documenting migration notes clearly.
- Medium: some existing examples may rely on fallback behavior. Fix examples rather than weakening strictness.
