---
phase: 7
title: "Validation, Documentation, and Release"
status: pending
priority: P1
effort: "6h"
dependencies: [phase-03, phase-04, phase-05, phase-06]
---

# Phase 7: Validation, Documentation, and Release

## Overview

Finish the hardening work with full validation, docs, migration notes, and release hygiene for breaking changes.

## Requirements

- Functional: all supported examples compile and generated outputs validate.
- Functional: docs explain breaking changes and migration path.
- Functional: release metadata communicates strict defaults, PostgreSQL-only support, and the return to upstream `@typespec/protobuf`.
- Non-functional: no stale phase assumptions or unsupported package references remain.

## Architecture

Docs and CI are part of the production contract. Keep generated examples checked in and use CI to prove they are reproducible. Protobuf documentation points to upstream `@typespec/protobuf` usage instead of a repo-owned emitter.

## Related Code Files

- Modify: `README.md`
- Modify: `packages/*/README.md`
- Modify: `.changeset/**`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `outputs/**`
- Modify: `docs/project-changelog.md` if docs are maintained there
- Modify: `docs/development-roadmap.md` if roadmap status changes

## Implementation Steps

1. Regenerate all examples from a clean output directory.
2. Run full validation:
   - `pnpm run build`
   - `pnpm run typecheck`
   - `pnpm run test`
   - `pnpm run test:coverage`
   - `pnpm run compile-examples`
   - generated Ent Go validation
   - generated SQLModel Python validation
   - generated Zod TypeScript validation
   - generated Protobuf validation via `buf` or `protoc`
3. Add generated drift check to CI.
4. Update root README:
   - supported package matrix
   - PostgreSQL-only statement
   - strict-by-default behavior
   - upstream `@typespec/protobuf` usage
   - `@qninhdt/typespec-protobuf` custom-emitter direction cancelled
   - GORM removed
5. Update package READMEs:
   - options
   - diagnostics
   - examples
   - known boundaries
6. Add migration notes:
   - local custom Protobuf emitter removed/cancelled
   - use upstream `@typespec/protobuf`
   - required `@field(number)` for Protobuf message fields
   - no fallback unsupported types in owned emitters
   - PostgreSQL-only support
7. Add changeset entries for breaking changes.
8. Run code-review and testing agents after implementation.

## Success Criteria

- [ ] Full local validation passes.
- [ ] CI config validates all generated target languages and upstream Protobuf outputs.
- [ ] Generated outputs are reproducible with no uncommitted drift after regeneration.
- [ ] README and package docs match actual behavior.
- [ ] Changesets document breaking changes.
- [ ] No stale custom `proto*`, `@qninhdt/typespec-protobuf`, GORM, MySQL, or SQLite claims remain in active docs/source.

## Risk Assessment

- Medium: full validation may reveal pre-existing generated output drift. Fix drift rather than weakening CI.
- Low: documentation changes are straightforward but must be kept brutally accurate.
