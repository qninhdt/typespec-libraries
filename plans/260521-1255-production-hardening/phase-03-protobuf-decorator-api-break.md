---
phase: 3
title: "Upstream Protobuf Adoption"
status: pending
priority: P0
effort: "4h"
dependencies: [phase-01, phase-02]
---

# Phase 3: Upstream Protobuf Adoption

## Overview

Cancel the repo-owned Protobuf emitter direction and migrate active schemas, configs, docs, and outputs back to upstream `@typespec/protobuf`.

## Requirements

- Functional: `@typespec/protobuf` is the only active Protobuf emitter.
- Functional: `@qninhdt/typespec-protobuf` package, imports, emit config, docs, and tests are removed or marked historical only.
- Functional: every emitted Protobuf message property uses upstream explicit `@field(number)`.
- Functional: service/package decorators follow upstream `TypeSpec.Protobuf` behavior.
- Non-functional: no local decorator aliases, wrappers, or compatibility shims for the abandoned custom emitter.

## Architecture

Protobuf is an external contract emitter. This repo owns TypeSpec schemas, example coverage, docs, and validation wiring; it does not own a Protobuf emitter implementation.

## Related Code Files

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `examples/**`
- Modify: `README.md`
- Modify: package READMEs that mention Protobuf
- Modify: `.github/workflows/ci.yml`
- Modify: generated `outputs/**/protobuf`
- Delete: `packages/typespec-protobuf/**`
- Delete/modify: custom Protobuf tests and docs if they exist outside the package

## Implementation Steps

1. Audit all references to `@qninhdt/typespec-protobuf`, `@typespec/protobuf`, `protoField`, `protoPackage`, `protoService`, `protoImport`, `protoMap`, and `@field(`.
2. Remove the local workspace package from dependencies, scripts, lockfile, workspace metadata, docs, and CI.
3. Delete `packages/typespec-protobuf/**` after confirming nothing supported imports it.
4. Ensure examples import upstream `@typespec/protobuf` and use upstream namespace/decorator syntax.
5. Add explicit `@field(number)` to every model property emitted as a Protobuf message field.
6. Replace any custom `@proto*` syntax with upstream Protobuf decorators or remove the unsupported contract feature.
7. Regenerate Protobuf outputs with upstream `@typespec/protobuf`.
8. Add tests or compile checks that prove old custom decorators are gone and upstream examples compile.

## Success Criteria

- [ ] `@typespec/protobuf` is the only Protobuf emitter dependency in active package metadata.
- [ ] No active source/config/example imports `@qninhdt/typespec-protobuf`.
- [ ] `packages/typespec-protobuf/**` is deleted or excluded from supported workspace builds.
- [ ] All emitted Protobuf fields have explicit upstream `@field(number)` declarations.
- [ ] Examples compile with upstream `@typespec/protobuf`.
- [ ] Generated Protobuf outputs are checked in under expected example output folders.

## Risk Assessment

- High: upstream decorator and emitter behavior may differ from the prototype. Verify through TypeSpec compilation and adjust schemas, not emitter internals.
- Medium: deleting the custom package may break tests that targeted prototype behavior. Remove or rewrite those tests around upstream integration.
