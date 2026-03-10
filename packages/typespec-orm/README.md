# @qninhdt/typespec-orm

[![npm version](https://img.shields.io/npm/v/@qninhdt/typespec-orm)](https://www.npmjs.com/package/@qninhdt/typespec-orm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

The **decorator library** for the `@qninhdt` TypeSpec ORM ecosystem.  
Annotate your TypeSpec models with table mappings, indexes, foreign-key constraints, and column metadata.  
Emitters (`typespec-gorm`, `typespec-sqlmodel`) read these decorators to generate code.

---

## Installation

```bash
pnpm add @qninhdt/typespec-orm
# or
npm install @qninhdt/typespec-orm
```

---

## Example

```typescript
import "@qninhdt/typespec-orm";
using Qninhdt.Orm;

enum Role {
  admin:  "admin",
  editor: "editor",
  viewer: "viewer",
}

/** Platform user account */
@table("users")
@compositeIndex("idx_users_email_role", "email", "role")
model User {
  @id id: uuid;

  @unique @maxLength(100)
  @format("email") @map("email_address")
  email: string;

  @maxLength(50) username: string;

  @index
  role: Role;

  @precision(12, 4) @map("credit_balance")
  creditBalance: decimal;

  isActive: boolean;

  @autoCreateTime @map("created_at") createdAt: utcDateTime;
  @autoUpdateTime @map("updated_at") updatedAt?: utcDateTime;
  @softDelete     @map("deleted_at") deletedAt?: utcDateTime;
}
```

---

## Decorator Reference

### Model-level decorators

| Decorator                          | Arguments                        | Description                        |
| ---------------------------------- | -------------------------------- | ---------------------------------- |
| `@table(name)`                     | `name: string`                   | Sets the database table name       |
| `@compositeIndex(name, ...fields)` | `name: string, fields: string[]` | Creates a named multi-column index |

### Property-level decorators

| Decorator                 | Arguments            | Description                                  |
| ------------------------- | -------------------- | -------------------------------------------- |
| `@id`                     | -                    | Marks the property as the primary key        |
| `@index`                  | -                    | Creates a single-column index                |
| `@unique`                 | -                    | Adds a unique constraint                     |
| `@map(column)`            | `column: string`     | Overrides the column name                    |
| `@maxLength(n)`           | `n: integer`         | Sets max length / varchar size               |
| `@precision(p, s)`        | `p, s: integer`      | Sets NUMERIC precision and scale             |
| `@format(f)`              | `f: string`          | Semantic format hint (email, url, uuid …)    |
| `@foreignKey(table, col)` | `table, col: string` | Declares a foreign-key reference             |
| `@onDelete(action)`       | `action: string`     | FK delete rule (`CASCADE`, `SET NULL`, etc.) |
| `@autoCreateTime`         | -                    | Set timestamp on INSERT (server default)     |
| `@autoUpdateTime`         | -                    | Set timestamp on UPDATE                      |
| `@softDelete`             | -                    | Enable soft-delete via a nullable timestamp  |

---

## Built-in Scalar Types

```typescript
// Available without importing anything extra:
scalar uuid      // maps to uuid / uuid.UUID / UUID
scalar text      // maps to text (unbounded string)
scalar decimal   // maps to numeric, use @precision to set precision
scalar serial    // maps to serial (auto-increment int32)
scalar bigserial // maps to bigserial (auto-increment int64)
scalar jsonb     // maps to jsonb (PostgreSQL JSON binary column)
```

Standard TypeSpec scalars (`string`, `int32`, `boolean`, `utcDateTime`, …) are also supported - see the [type mapping table](../../README.md#type-mapping-reference).

---

## Diagnostics

The validator runs at compile time and reports the following diagnostics:

| Code                                    | Severity | Message (summary)                                          |
| --------------------------------------- | -------- | ---------------------------------------------------------- |
| `orm-missing-table-decorator`           | error    | Model missing `@table` decorator                           |
| `orm-missing-id`                        | error    | No `@id` property found on model                           |
| `orm-duplicate-id`                      | error    | Multiple `@id` properties detected                         |
| `orm-invalid-foreign-key-type`          | error    | `@foreignKey` property must be a model type                |
| `orm-id-must-be-uuid`                   | error    | Primary key must be of type `uuid`                         |
| `orm-auto-time-non-datetime`            | error    | `@autoCreateTime`/`@autoUpdateTime` requires `utcDateTime` |
| `orm-soft-delete-non-datetime`          | error    | `@softDelete` requires `utcDateTime`                       |
| `orm-precision-non-decimal`             | error    | `@precision` only applies to `decimal` or `float64`        |
| `orm-max-length-non-string`             | error    | `@maxLength` only applies to `string`                      |
| `orm-id-cannot-be-optional`             | error    | Primary key may not be optional                            |
| `orm-unique-requires-index`             | warning  | `@unique` implies an index; `@index` is redundant          |
| `orm-missing-on-delete`                 | warning  | `@foreignKey` without `@onDelete`; defaults to `NO ACTION` |
| `orm-index-non-primitive`               | warning  | Indexing a non-primitive type may be unintentional         |
| `orm-soft-delete-must-be-optional`      | warning  | `@softDelete` column should be optional (`?`)              |
| `orm-auto-update-time-must-be-optional` | warning  | `@autoUpdateTime` column should be optional                |
| `orm-precision-out-of-range`            | warning  | Precision or scale value is out of recommended range       |

---

## License

[MIT](../../LICENSE) © [Nguyen Quang Ninh](https://github.com/qninhdt)
