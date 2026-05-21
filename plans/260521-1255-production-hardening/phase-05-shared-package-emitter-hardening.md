---
phase: 5
title: "Shared Package Emitter Hardening"
status: pending
priority: P1
effort: "8h"
dependencies: [phase-02]
---

# Phase 5: Shared Package Emitter Hardening

## Overview

Harden Ent, SQLModel, Zod, and DBML for shared generated package use in PostgreSQL-only microservice systems.

## Requirements

- Functional: generated packages have stable import/export surfaces.
- Functional: generated outputs compile and are suitable for publication or shared internal package consumption.
- Functional: database emitters are PostgreSQL-specific and honest.
- Non-functional: deterministic output and no hidden runtime behavior changes.

## Architecture

Generated ORM/model packages are shared artifacts, so package metadata, imports, and public exports must be deliberate. Persistence emitters target PostgreSQL only. Cross-service contracts should use upstream `@typespec/protobuf`; Ent/SQLModel/Zod/DBML remain the repo-owned generated package surfaces.

## Related Code Files

- Modify: `packages/typespec-ent/src/emitter.tsx`
- Modify: `packages/typespec-ent/src/components/EntSchema.tsx`
- Modify: `packages/typespec-sqlmodel/src/emitter.tsx`
- Modify: `packages/typespec-sqlmodel/src/components/**`
- Modify: `packages/typespec-zod/src/emitter.tsx`
- Modify: `packages/typespec-zod/src/components/**`
- Modify: `packages/typespec-dbml/src/emitter.tsx`
- Modify: `packages/typespec-dbml/src/components/**`
- Modify/Create: package tests for generated output compilation

## Implementation Steps

1. Ent hardening:
   - fix or reject `@onUpdate` if Ent/Atlas cannot represent it.
   - make unsupported relation shapes errors.
   - consolidate PostgreSQL-specific decimal/schema type rendering.
   - add generated `go test` or `go build` validation over checked-in outputs.
2. SQLModel hardening:
   - fix root `metadata` collision by exporting `target_metadata` or `orm_metadata`.
   - remove non-PostgreSQL dialect claims.
   - stop inferring ORM `delete-orphan` from DB cascade unless explicit ownership metadata exists.
   - add generated package import and `SQLModel.metadata` construction tests.
3. Zod hardening:
   - add explicit object unknown-key policy, default strict for API/shared outputs.
   - add wire-safe date mode or default to serialized strings for service boundaries if examples require API use.
   - separate or version form metadata if it remains in shared package output.
   - make standalone package `package.json` and `tsconfig.json` buildable.
4. DBML hardening:
   - define cross-namespace split relation policy.
   - fail on unsupported columns by default.
   - sort enums/refs deterministically.
   - add Project metadata with PostgreSQL label where useful.
5. Add golden-output tests comparing examples against checked-in generated outputs.
6. Update checked-in outputs after implementation.

## Success Criteria

- [ ] Generated Ent output builds/tests in CI.
- [ ] Generated SQLModel packages import successfully and expose non-conflicting metadata.
- [ ] Generated Zod standalone packages typecheck.
- [ ] DBML split output handles cross-namespace refs predictably.
- [ ] All owned supported emitters produce deterministic output.
- [ ] Checked-in generated outputs match regenerated outputs.

## Risk Assessment

- High: shared package exports are breaking if renamed. Accept because production safety beats compatibility before stable release.
- Medium: Zod date/wire semantics may affect frontend forms. Document form vs API usage clearly.
