---
title: "Production Hardening — TypeSpec Libraries"
description: "Make the libraries production-safe for shared PostgreSQL microservice packages: strict defaults, upstream Protobuf integration, no GORM, and hardened emitters"
status: pending
priority: P1
branch: "dev"
tags: [hardening, production-readiness, protobuf, postgres, strict-mode]
blockedBy: []
blocks: []
created: "2026-05-21T04:55:28.756Z"
updated: "2026-05-22"
createdBy: "ck:plan"
source: skill
---

# Production Hardening — TypeSpec Libraries

## Overview

Bring the repo from internal codegen toolkit to production-safe shared package platform for large PostgreSQL microservice systems. This plan supersedes `plans/260521-0113-custom-protobuf-emitter/` because maintaining a repo-owned Protobuf emitter is no longer the chosen direction.

## Decisions

- PostgreSQL only. Remove misleading MySQL/SQLite behavior.
- Generated ORM/model outputs are shared packages, not service-private throwaways.
- Use upstream `@typespec/protobuf` for Protobuf contracts.
- Remove `@qninhdt/typespec-protobuf` package usage and do not maintain a local Protobuf emitter fork.
- `typespec-gorm` is removed permanently; Ent is the Go ORM target.
- Strict mode is default for owned emitters. Lossy generation must fail unless explicitly allowed later.
- Protobuf message fields follow upstream explicit `@field(number)` semantics.
- Protobuf decorators follow upstream `TypeSpec.Protobuf`; no local unprefixed API fork.

## Phases

| Phase | Name | Status | Priority | Effort |
|---|---|---|---|---|
| 1 | [Scope Reset and PostgreSQL Baseline](./phase-01-scope-reset-and-postgresql-baseline.md) | Pending | P0 | 4h |
| 2 | [Strict Diagnostics by Default](./phase-02-strict-diagnostics-by-default.md) | Pending | P0 | 5h |
| 3 | [Upstream Protobuf Adoption](./phase-03-protobuf-decorator-api-break.md) | Pending | P0 | 4h |
| 4 | [Protobuf Contract Validation](./phase-04-protobuf-contract-maturity.md) | Pending | P1 | 6h |
| 5 | [Shared Package Emitter Hardening](./phase-05-shared-package-emitter-hardening.md) | Pending | P1 | 8h |
| 6 | [Enterprise Schema Features](./phase-06-enterprise-schema-features.md) | Pending | P2 | 10h |
| 7 | [Validation, Documentation, and Release](./phase-07-validation-documentation-and-release.md) | Pending | P1 | 6h |

## Dependencies

- Phase 1 must land first; it removes stale scope and CI ambiguity.
- Phase 2 must precede emitter hardening; strict diagnostics define failure behavior for owned emitters.
- Phase 3 must precede Phase 4; upstream Protobuf examples and schema usage must exist before contract validation.
- Phase 5 depends on Phases 1-2.
- Phase 6 can start after Phase 2, but should merge after Phase 5 if generated outputs change.
- Phase 7 depends on all code phases.

## Success Criteria

- No `typespec-gorm` or `@qninhdt/typespec-protobuf` usage remains.
- Active Protobuf examples, scripts, docs, and CI use upstream `@typespec/protobuf`.
- PostgreSQL-only behavior is explicit in options, docs, examples, and CI.
- Protobuf schemas use explicit upstream `@field(number)` where message fields are emitted.
- Unsupported/lossy generation fails by default across owned emitters.
- Generated Ent, SQLModel, Zod, DBML, and upstream Protobuf outputs are validated in CI.
- Docs clearly mark supported packages, strict defaults, shared package usage, upstream Protobuf usage, and migration notes.
