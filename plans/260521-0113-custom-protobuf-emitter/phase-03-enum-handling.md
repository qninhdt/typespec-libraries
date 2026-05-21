---
phase: 3
title: "Enum handling (numeric-only for proto)"
status: pending
priority: P1
effort: "2h"
dependencies: [phase-02]
---

# Phase 03: Enum handling (numeric-only for proto)

## Overview

Implement proto-specific enum rendering that always produces numeric enums regardless of how the TypeSpec enum is defined. Handle the proto3 requirement that enum value 0 must exist.

## Requirements

- Functional: Enums with numeric values use them directly
- Functional: Enums with string values get auto-assigned numeric values (0-based)
- Functional: Emit diagnostic if no 0-value member exists (proto3 requires it)
- Functional: Support `UNSPECIFIED` pattern — auto-prepend if missing
- Non-functional: Clear separation from ORM enum handling (ORM uses strings for DB)

## Architecture

The enum mapper takes a TypeSpec `Enum` and produces a `ProtoEnum`:

```typescript
interface ProtoEnum {
  name: string;
  members: ProtoEnumMember[];
  hasZeroValue: boolean;
}

interface ProtoEnumMember {
  name: string; // UPPER_SNAKE_CASE
  value: number; // proto field number
}
```

Strategy:

1. If all members have numeric values → use them directly
2. If members have string values → assign sequential numbers starting from 0
3. If no member has value 0 → emit warning diagnostic, auto-prepend `{ENUM_NAME}_UNSPECIFIED = 0`

Naming convention: proto enum members are UPPER_SNAKE_CASE (e.g. `active` → `ACTIVE`, `waitingForApproval` → `WAITING_FOR_APPROVAL`).

## Related Code Files

- Create: `packages/typespec-protobuf/src/enum-mapping.ts`
- Modify: `packages/typespec-protobuf/src/lib.ts` (add diagnostic for missing zero value)
- Modify: `packages/typespec-protobuf/src/index.ts` (re-export)

## Implementation Steps

1. Create `src/enum-mapping.ts`:
   - `resolveProtoEnum(program, enumType)` → `ProtoEnum`
   - `camelToUpperSnake(name)` helper for member name conversion
   - Logic to detect numeric vs string enums
   - Auto-prepend unspecified member if no 0-value exists
2. Add diagnostic `proto-enum-missing-zero` to `src/lib.ts`
3. Add diagnostic `proto-enum-string-values` (info-level) when string enum is auto-numbered
4. Unit tests for:
   - Numeric enum passthrough
   - String enum auto-numbering
   - Missing zero value warning + auto-prepend
   - camelCase → UPPER_SNAKE_CASE conversion

## Success Criteria

- [ ] `enum Foo { active: 1, disabled: 2 }` → proto enum with those exact values
- [ ] `enum Bar { active, disabled }` (string) → auto-numbered 0, 1
- [ ] Enum without 0-value emits diagnostic and prepends UNSPECIFIED
- [ ] Member names are UPPER_SNAKE_CASE in output

## Risk Assessment

- Low: proto3 enum rules are well-defined
- Edge case: enum with mixed numeric/string values — treat as error diagnostic
