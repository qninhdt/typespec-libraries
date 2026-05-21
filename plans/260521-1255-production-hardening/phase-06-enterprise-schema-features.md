---
phase: 6
title: "Enterprise Schema Features"
status: pending
priority: P2
effort: "10h"
dependencies: [phase-02, phase-05]
---

# Phase 6: Enterprise Schema Features

## Overview

Add schema features that large PostgreSQL microservice systems commonly need once strictness and emitter correctness are in place.

## Requirements

- Functional: support enterprise relational modeling without relying on string hacks.
- Functional: features must be reflected consistently across relevant emitters.
- Non-functional: keep scope practical; do not add features without immediate emitter/test coverage.

## Architecture

Extend ORM core first, then emit feature support only where target ecosystem can represent it safely. Unsupported target mappings must fail, not silently drop semantics.

## Related Code Files

- Modify: `packages/typespec-orm/lib/main.tsp`
- Modify: `packages/typespec-orm/src/decorators.ts`
- Modify: `packages/typespec-orm/src/lib.ts`
- Modify: `packages/typespec-orm/src/helpers.ts` or split helper modules
- Modify: `packages/typespec-orm/src/validators.ts`
- Modify: Ent/SQLModel/DBML emitters for supported schema features
- Modify: Zod only for DTO/form-relevant validation features
- Modify: Protobuf only for contract-relevant features

## Implementation Steps

1. Composite key/reference design:
   - add table-level primary/unique/index decorators or improve existing composite metadata into a first-class API.
   - support composite foreign keys for tenant-scoped relations.
   - validate property existence and compatible types.
2. Tenant-scoped modeling:
   - add documented pattern or decorator for tenant keys.
   - validate tenant-scoped FKs include tenant boundary where applicable.
3. Optimistic concurrency:
   - add `@version` decorator for numeric version fields.
   - emit in Ent and SQLModel where runtime support is clear.
4. Advanced indexes:
   - support named composite indexes cleanly.
   - evaluate partial indexes only if PostgreSQL emission and migration validation can prove correctness.
5. Explicit junction table guidance:
   - document when many-to-many shorthand is allowed.
   - add tests for payload-bearing explicit junction models.
6. Schema manifest:
   - emit or expose normalized schema metadata for future compatibility diffing.
   - include package/emitter versions, model names, fields, relations, and constraints.

## Success Criteria

- [ ] Composite PK/FK is represented in ORM core and at least Ent/SQLModel/DBML.
- [ ] Tenant-scoped relation tests exist.
- [ ] `@version` validates and emits where supported.
- [ ] Many-to-many payload pattern is documented and tested.
- [ ] Schema manifest prototype exists or is explicitly deferred with reason.

## Risk Assessment

- High: composite FK support touches core relation assumptions. Implement tests before emitter changes.
- Medium: tenant validation can become opinionated. Keep the first version minimal and explicit.
- Medium: schema manifest can grow large. Start with compatibility-critical fields only.
