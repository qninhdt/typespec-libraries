# @qninhdt/typespec-orm

[![npm version](https://img.shields.io/npm/v/@qninhdt/typespec-orm)](https://www.npmjs.com/package/@qninhdt/typespec-orm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

The **decorator library** for the `@qninhdt` TypeSpec ORM ecosystem.  
Annotate your TypeSpec models with table mappings, indexes, foreign-key constraints, column metadata, and form field hints.  
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

## Derived Models - PickProperties, OmitProperties & Lookup Types

TypeSpec's built-in template types let you derive new models from existing `@table` models without duplicating field definitions. Validators and decorators are inherited automatically.

### PickProperties - select specific fields

```typescript
/** Lightweight profile view - only identity + display columns. */
@data
model UserProfile is PickProperties<User, "id" | "email" | "username">;
```

### OmitProperties - exclude fields

```typescript
/** Public-facing user record with sensitive columns stripped. */
@data
model PublicUser is OmitProperties<User, "passwordHash" | "deletedAt" | "updatedAt">;
```

### Lookup types - reference a field from another model

Use `Model.property` as a field type to create a **lookup type**. The field inherits the source property's type and all validators (`@maxLength`, `@format`, `@minValue`, `@doc`, etc.).

```typescript
@table("invitations")
model Invitation {
  @id id: uuid;

  /** Inherits @maxLength(320) and @format("email") from User.email */
  inviteeEmail: User.email;

  /** Inherits @maxLength(200) from World.name */
  worldName: World.name;

  @autoCreateTime @map("created_at") createdAt: utcDateTime;
}
```

---

## Form / Data Models (`@data`)

Use `@data` to define a **form payload or DTO** that emitters render as a typed struct / class with no database schema.

```typescript
@data("Create Invitation Form")
model CreateInvitationForm {
  /** Lookup type - inherits @maxLength(320) and @format("email") from User.email */
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: User.email;

  @title("Personal Message")
  @placeholder("Write a short note to your invitee…")
  @maxLength(1000)
  message?: text;
}

// @@inputType targets Scalar - use ::type to obtain the scalar:
//   Direct field:    @@inputType(CreateInvitationForm.message::type, "textarea")
//   Lookup field:    message::type resolves to `text` scalar - works ✓
@@inputType(CreateInvitationForm.message::type, "textarea");

// For lookup-typed fields, go through the source property's custom scalar:
@@inputType(World.prompt::type, "textarea");  // World.prompt: text (custom scalar)
```

---

## Decorator Reference

### Model-level decorators

| Decorator                            | Arguments                         | Description                                    |
| ------------------------------------ | --------------------------------- | ---------------------------------------------- |
| `@table(name?)`                      | `name?: string`                   | Maps model to a database table                 |
| `@compositeIndex(name, ...columns)`  | `name: string, columns: string[]` | Creates a named multi-column index             |
| `@compositeUnique(name, ...columns)` | `name: string, columns: string[]` | Creates a named multi-column unique constraint |
| `@data(label?)`                      | `label?: string`                  | Marks model as a non-DB data / form shape      |

### Property-level decorators

| Decorator                 | Arguments            | Description                                       |
| ------------------------- | -------------------- | ------------------------------------------------- |
| `@id`                     | -                    | Marks the property as the primary key             |
| `@index(name?)`           | `name?: string`      | Creates a single-column index                     |
| `@unique`                 | -                    | Adds a unique constraint                          |
| `@map(column)`            | `column: string`     | Overrides the column name                         |
| `@autoIncrement`          | -                    | Marks as auto-increment (serial / bigserial)      |
| `@autoCreateTime`         | -                    | Set timestamp on INSERT                           |
| `@autoUpdateTime`         | -                    | Set timestamp on UPDATE                           |
| `@softDelete`             | -                    | Enable soft-delete via a nullable timestamp       |
| `@foreignKey(table, col)` | `table, col: string` | Declares a foreign-key reference                  |
| `@onDelete(action)`       | `action: string`     | FK delete rule (`CASCADE`, `SET NULL`, etc.)      |
| `@onUpdate(action)`       | `action: string`     | FK update rule                                    |
| `@precision(p, s?)`       | `p, s: integer`      | Sets NUMERIC precision and scale                  |
| `@ignore`                 | -                    | Exclude from DB schema (virtual / computed field) |
| `@title(text)`            | `text: string`       | Human-readable field label for form / DTO models  |
| `@placeholder(text)`      | `text: string`       | Placeholder hint shown before user types          |

### Scalar-level decorator (augment syntax)

| Decorator                       | Arguments                          | Description                                           |
| ------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `@@inputType(scalar, htmlType)` | `scalar: Scalar, htmlType: string` | HTML input type hint for a scalar (e.g. `"textarea"`) |

> **Note:** `@@inputType` targets a `Scalar`. Use `Field::type` to obtain the scalar from a direct field (`message::type → text`). For lookup-typed fields, go through the source property: `World.prompt::type → text` (only works when the source property's type is a custom scalar, not a built-in like `string`).

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

| Code                            | Severity | Description                                                    |
| ------------------------------- | -------- | -------------------------------------------------------------- |
| `multiple-ids`                  | error    | Model has more than one `@id` property                         |
| `multiple-soft-deletes`         | error    | Model has more than one `@softDelete` property                 |
| `duplicate-table-name`          | error    | Two `@table` models map to the same table name                 |
| `duplicate-column-name`         | error    | Two properties produce the same column name                    |
| `composite-column-not-found`    | error    | Column in `@compositeIndex`/`@compositeUnique` does not exist  |
| `precision-on-non-numeric`      | error    | `@precision` applied to a non-numeric type                     |
| `auto-increment-on-non-integer` | error    | `@autoIncrement` applied to a non-integer type                 |
| `soft-delete-on-non-datetime`   | error    | `@softDelete` requires a datetime type                         |
| `auto-time-on-non-datetime`     | error    | `@autoCreateTime`/`@autoUpdateTime` requires a datetime type   |
| `ignore-conflicts`              | error    | `@ignore` combined with a DB decorator (`@id`, `@index`, etc.) |
| `missing-id`                    | warning  | `@table` model has no `@id` property                           |
| `redundant-unique-on-id`        | warning  | `@unique` on a primary-key property is redundant               |
| `redundant-index-on-unique`     | warning  | `@index` on a `@unique` property is redundant                  |
| `redundant-map`                 | warning  | `@map` value matches the auto-derived column name              |
| `cascade-without-relation`      | warning  | `@onDelete`/`@onUpdate` on a non-relation property             |

---

## License

[MIT](../../LICENSE) © [Nguyen Quang Ninh](https://github.com/qninhdt)
