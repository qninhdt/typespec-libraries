# Custom scalars

This library extends TypeSpec's built-in scalars with semantic and
PostgreSQL-flavored ones. They participate in every emitter and carry
their own validators where available.

## Identifier scalars

| Scalar      | PG column   | Go (Ent)             | Python (SQLModel) | Zod                     |
| ----------- | ----------- | -------------------- | ----------------- | ----------------------- |
| `uuid`      | `uuid`      | `uuid.UUID`          | `UUID`            | `z.uuid()`              |
| `ulid`      | `text`      | `string` (validated) | `ULID`            | `z.string().regex(...)` |
| `cuid`      | `text`      | `string` (validated) | `str`             | `z.cuid()`              |
| `cuid2`     | `text`      | `string` (validated) | `str`             | `z.cuid2()`             |
| `nanoid`    | `text`      | `string` (validated) | `str`             | `z.nanoid()`            |
| `serial`    | `serial`    | `int`                | `int`             | `z.number().int()`      |
| `bigserial` | `bigserial` | `int64`              | `int`             | `z.number().int()`      |

`serial` / `bigserial` imply `@autoIncrement` and `@key`. You don't
need to add them manually.

## String scalars (semantic)

| Scalar     | PG column | Notes                                         |
| ---------- | --------- | --------------------------------------------- |
| `email`    | `text`    | Format-validated. Pydantic uses `EmailStr`.   |
| `text`     | `text`    | Unbounded text — no `varchar(n)`.             |
| `citext`   | `citext`  | Case-insensitive text. Requires `citext` ext. |
| `jwt`      | `text`    | Format-validated.                             |
| `base64`   | `text`    | Format-validated.                             |
| `emoji`    | `text`    | Format-validated.                             |
| `hostname` | `text`    | Format-validated.                             |

For bounded text columns use `string` plus `@maxLength(n)`.

## Network scalars

| Scalar | PG column | Notes                       |
| ------ | --------- | --------------------------- |
| `inet` | `inet`    | IPv4 or IPv6.               |
| `cidr` | `cidr`    | Network with mask.          |
| `mac`  | `macaddr` | MAC address.                |
| `ipv4` | `inet`    | IPv4-only validated string. |
| `ipv6` | `inet`    | IPv6-only validated string. |
| `ip`   | `inet`    | Either IPv4 or IPv6.        |

Pydantic uses `IPv4Address` / `IPv6Address` typed fields.

## JSON

| Scalar  | PG column |
| ------- | --------- |
| `jsonb` | `jsonb`   |

`jsonb` is the canonical JSON column. The library doesn't expose a
plain `json` scalar — `jsonb` is the right default in PostgreSQL.

## Geo

| Scalar      | PG column          | Notes                  |
| ----------- | ------------------ | ---------------------- |
| `latitude`  | `double precision` | Validated (-90..90).   |
| `longitude` | `double precision` | Validated (-180..180). |

## Time and intervals

`utcDateTime`, `plainDate`, `plainTime`, `duration` come from TypeSpec
itself. The library adds:

| Scalar     | PG column  |
| ---------- | ---------- |
| `interval` | `interval` |

## Full-text search

| Scalar     | PG column  | Notes                     |
| ---------- | ---------- | ------------------------- |
| `tsvector` | `tsvector` | Pre-tokenized search doc. |
| `tsquery`  | `tsquery`  | Search query expression.  |

## Composite columns

The `composite<...>` template is a legacy multi-column marker. Prefer
`@@tableUnique([...])` and `@@tableIndex([...])` for new code.

## Branded scalars (Zod)

When `branded-scalars: true` is set on the Zod emitter, every
user-defined scalar gets a `.brand("ScalarName")` chain so that
TypeScript distinguishes between, say, `UserId` and `OrderId`:

```ts
export const UserIdSchema = z.uuid().brand("UserId");
export type UserId = z.infer<typeof UserIdSchema>;
```

This applies only to scalars _you_ declare in your schema — not to
library scalars like `email` or `uuid` themselves.

## See also

- [Reference / Scalars](/reference/scalars) — flat lookup table.
- TypeSpec built-in scalars — see the upstream
  [TypeSpec docs](https://typespec.io/docs/standard-library/built-in-data-types).
