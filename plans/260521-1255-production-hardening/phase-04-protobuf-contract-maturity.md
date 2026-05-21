---
phase: 4
title: "Protobuf Contract Validation"
status: pending
priority: P1
effort: "6h"
dependencies: [phase-03]
---

# Phase 4: Protobuf Contract Validation

## Overview

Harden Protobuf usage by validating upstream `@typespec/protobuf` outputs as shared microservice contracts.

## Requirements

- Functional: generated `.proto` files validate with `buf` or `protoc`.
- Functional: supported schemas cover explicit field numbering, packages, services, streams where upstream supports them, enums, imports, and external type references.
- Functional: unsupported upstream emitter gaps are documented or schema-scoped out, not patched through a local emitter fork.
- Non-functional: output validation is deterministic and compatibility-conscious.

## Architecture

The Protobuf emitter remains upstream. Contract quality is enforced by schema conventions, compile checks, generated-output validation, and documentation. ORM persistence emitters remain separate from Protobuf contracts.

## Related Code Files

- Modify: `examples/**`
- Modify: generated `outputs/**/protobuf`
- Modify: root `package.json` compile/validation scripts
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: package docs that describe service contracts or generated outputs
- Create/modify: tests that compile upstream Protobuf examples

## Implementation Steps

1. Define the first supported Protobuf contract surface using upstream features only: packages, messages, enums, field numbers, and services if examples require them.
2. Compile `examples/file-vault` and `examples/game-platform` with upstream `@typespec/protobuf` where Protobuf output is expected.
3. Add `buf` or `protoc` validation for generated `.proto` files.
4. Validate imports and fully qualified type references produced by upstream output; change schemas/layout if needed.
5. Validate void/no-response and streaming examples only if upstream supports the needed service shapes.
6. Do not promise include/exclude selector parity for Protobuf unless upstream supports it; document any limitation.
7. Add golden `.proto` outputs under `outputs/file-vault/protobuf` and `outputs/game-platform/protobuf` when both examples produce contracts.
8. Document field-number compatibility rules and upstream Protobuf usage.

## Success Criteria

- [ ] `buf lint` or `protoc` validates generated `.proto` files.
- [ ] Missing or duplicate Protobuf field numbers fail through upstream compilation.
- [ ] Cross-namespace references either validate as generated or are documented as unsupported in current schemas.
- [ ] Service and streaming examples are included only when upstream output validates.
- [ ] Include/exclude behavior is not advertised unless upstream supports it and tests prove it.
- [ ] Docs explain upstream Protobuf usage and compatibility rules.

## Risk Assessment

- High: Protobuf compatibility is strict; wrong field numbers or type changes can break consumers. Required upstream `@field` and validation mitigate.
- Medium: upstream feature gaps may tempt reintroducing a local emitter. Keep gaps documented or out of scope unless a separate user-approved plan changes direction.
