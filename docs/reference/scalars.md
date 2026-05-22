# Scalars

The full list of scalars `@qninhdt/typespec-orm` provides, with their
mapping in each emitter. For background, see the
[Custom scalars guide](/guide/custom-scalars).

## TypeSpec built-ins

These come from TypeSpec itself. They're listed here for completeness —
the emitters know how to handle them all.

| TypeSpec      | PG type               | Go (Ent)          | Python (SQLModel) | Zod                        |
| ------------- | --------------------- | ----------------- | ----------------- | -------------------------- |
| `string`      | `text` / `varchar(n)` | `string`          | `str`             | `z.string()`               |
| `boolean`     | `boolean`             | `bool`            | `bool`            | `z.boolean()`              |
| `int8`        | `smallint`            | `int8`            | `int`             | `z.number().int()`         |
| `int16`       | `smallint`            | `int16`           | `int`             | `z.number().int()`         |
| `int32`       | `integer`             | `int32`           | `int`             | `z.number().int()`         |
| `int64`       | `bigint`              | `int64`           | `int`             | strategy-dependent         |
| `uint32`      | `bigint`              | `uint32`          | `int`             | `z.number().int()`         |
| `uint64`      | `numeric(20)`         | `uint64`          | `int`             | strategy-dependent         |
| `float32`     | `real`                | `float32`         | `float`           | `z.number()`               |
| `float64`     | `double precision`    | `float64`         | `float`           | `z.number()`               |
| `decimal`     | `numeric`             | `decimal.Decimal` | `Decimal`         | `z.string().regex(...)`    |
| `decimal128`  | `numeric`             | `decimal.Decimal` | `Decimal`         | `z.string()`               |
| `bytes`       | `bytea`               | `[]byte`          | `bytes`           | `z.instanceof(Uint8Array)` |
| `utcDateTime` | `timestamptz`         | `time.Time`       | `datetime`        | `z.iso.datetime()`         |
| `plainDate`   | `date`                | `time.Time`       | `date`            | `z.iso.date()`             |
| `plainTime`   | `time`                | `time.Time`       | `time`            | `z.iso.time()`             |
| `duration`    | `interval`            | `time.Duration`   | `timedelta`       | `z.string()`               |
| `url`         | `text`                | `string`          | `AnyUrl`          | `z.url()`                  |

`int64` and `uint64` follow the Zod emitter's `int64-strategy` setting:
`"bigint"`, `"string"`, or `"number"` (default `"string"` for safety).

## Identifier scalars

| Scalar      | PG type     | Go (Ent)           | Python (SQLModel) | Zod                     |
| ----------- | ----------- | ------------------ | ----------------- | ----------------------- |
| `uuid`      | `uuid`      | `uuid.UUID`        | `UUID`            | `z.uuid()`              |
| `ulid`      | `text`      | validated `string` | `ULID`            | `z.string().regex(...)` |
| `cuid`      | `text`      | validated `string` | `str`             | `z.cuid()`              |
| `cuid2`     | `text`      | validated `string` | `str`             | `z.cuid2()`             |
| `nanoid`    | `text`      | validated `string` | `str`             | `z.nanoid()`            |
| `serial`    | `serial`    | `int` (auto-key)   | `int` (auto-key)  | `z.number().int()`      |
| `bigserial` | `bigserial` | `int64` (auto-key) | `int` (auto-key)  | strategy-dependent      |

`serial` and `bigserial` imply `@autoIncrement` and `@key`.

## Semantic string scalars

| Scalar     | PG type  | Notes                                           |
| ---------- | -------- | ----------------------------------------------- |
| `email`    | `text`   | Pydantic uses `EmailStr`. Zod uses `z.email()`. |
| `text`     | `text`   | Unbounded text — no `varchar(n)`.               |
| `citext`   | `citext` | Case-insensitive text. Requires `citext` ext.   |
| `jwt`      | `text`   | Format-validated string.                        |
| `base64`   | `text`   | Format-validated string.                        |
| `emoji`    | `text`   | Format-validated string.                        |
| `hostname` | `text`   | Format-validated string.                        |

## Network scalars

| Scalar | PG type   | Notes                       |
| ------ | --------- | --------------------------- |
| `inet` | `inet`    | IPv4 or IPv6 address.       |
| `cidr` | `cidr`    | Network with mask.          |
| `mac`  | `macaddr` | MAC address.                |
| `ipv4` | `inet`    | IPv4-only validated string. |
| `ipv6` | `inet`    | IPv6-only validated string. |
| `ip`   | `inet`    | Either IPv4 or IPv6.        |

Pydantic uses typed `IPv4Address` / `IPv6Address` fields.

## JSON, geo, time

| Scalar      | PG type            | Notes                  |
| ----------- | ------------------ | ---------------------- |
| `jsonb`     | `jsonb`            | Canonical JSON column. |
| `latitude`  | `double precision` | Validated -90..90.     |
| `longitude` | `double precision` | Validated -180..180.   |
| `interval`  | `interval`         | PG interval.           |

## Full-text search

| Scalar     | PG type    | Notes                     |
| ---------- | ---------- | ------------------------- |
| `tsvector` | `tsvector` | Pre-tokenized search doc. |
| `tsquery`  | `tsquery`  | Search query expression.  |

## Composite

| Scalar              | Notes                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| `composite<C1..C5>` | Legacy multi-column marker. Prefer `@@tableUnique` / `@@tableIndex` for new code. |

## Validator inheritance

Validators (`@maxLength`, `@minValue`, `@pattern`, `@format`) attached
to a property apply through every emitter — Ent emits `MaxLen`,
SQLModel emits `Field(max_length=...)`, Zod emits `.max(...)`.

When you reference a property via a lookup type
(`Demo.Accounts.User.email`), you also inherit its validators. That's
why form fields can reuse table-level constraints without restating
them.
