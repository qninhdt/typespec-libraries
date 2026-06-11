# Type Mapping

How `@qninhdt/typespec-protobuf` resolves a TypeSpec property type to a
proto wire shape. The resolver (`src/types/resolver.ts`) walks a fixed order;
the FIRST match wins.

## Resolution order

1. `@map(key, value)` override on the property → `map<K, V>`.
2. `@goType(...)` override → `bytes` (with a Go binding hint).
3. `Array<T>` → `repeated T` (recurses on `T`).
4. `Record<V>` / `Map<K, V>` → `map<string, V>` (recurses on `V`).
5. Well-known TypeSpec scalar → google well-known message.
6. Storage-only ORM scalar → diagnostic + `google.protobuf.Any`.
7. ORM semantic scalar → its wire type.
8. Built-in TypeSpec scalar → proto scalar.
9. `Model` reference → message ref. `Enum` reference → enum ref.
10. Anything else → `google.protobuf.Any` + a warning.

## Built-in scalars

| TypeSpec                                                    | Proto    | Notes                       |
| ----------------------------------------------------------- | -------- | --------------------------- |
| `string`                                                    | `string` |                             |
| `boolean`                                                   | `bool`   |                             |
| `int8` / `int16` / `int32`                                  | `int32`  | proto has no narrower ints  |
| `int64` / `safeint` / `integer`                             | `int64`  |                             |
| `uint8` / `uint16` / `uint32`                               | `uint32` |                             |
| `uint64`                                                    | `uint64` |                             |
| `float32`                                                   | `float`  |                             |
| `float64` / `float`                                         | `double` |                             |
| `bytes`                                                     | `bytes`  |                             |
| `numeric`                                                   | `string` | precision preserved as text |
| `sint32`/`sint64`/`sfixed32`/`sfixed64`/`fixed32`/`fixed64` | same     | upstream-compat encodings   |

## Well-known (default ON, per-type toggle)

| TypeSpec                         | Proto                       | Import                            | Toggle                 |
| -------------------------------- | --------------------------- | --------------------------------- | ---------------------- |
| `utcDateTime` / `offsetDateTime` | `google.protobuf.Timestamp` | `google/protobuf/timestamp.proto` | `well-known.timestamp` |
| `duration`                       | `google.protobuf.Duration`  | `google/protobuf/duration.proto`  | `well-known.duration`  |
| `plainDate`                      | `google.type.Date`          | `google/type/date.proto`          | `well-known.date`      |
| `plainTime`                      | `google.type.TimeOfDay`     | `google/type/timeofday.proto`     | `well-known.time`      |
| `decimal`                        | `google.type.Decimal`       | `google/type/decimal.proto`       | `well-known.decimal`   |

Toggle a type OFF in `tspconfig` to use a fallback wire type instead:
`timestamp`/`duration` → `int64` (epoch ms); `date`/`time`/`decimal` → `string`.

## ORM scalars (`@qninhdt/typespec-orm`)

| ORM scalar                                             | Proto                               |
| ------------------------------------------------------ | ----------------------------------- |
| `uuid`                                                 | `string`                            |
| `jsonb`                                                | `string` (or `bytes` via `@goType`) |
| `email` / `url` / `base64` / `hostname`                | `string`                            |
| `cuid` / `cuid2` / `ulid` / `nanoid` / `jwt` / `emoji` | `string`                            |
| `serial`                                               | `int32`                             |
| `bigserial`                                            | `int64`                             |
| `latitude` / `longitude`                               | `double`                            |

### Storage-only (NOT in the default table)

`tsvector`, `tsquery`, `citext`, `inet`, `cidr`, `ipv4`, `ipv6`, `ip`, `mac`,
`interval` — Postgres-internal types that rarely belong on the wire. The resolver
emits a `storage-only-scalar-on-wire` diagnostic and falls back to
`google.protobuf.Any`. To surface one intentionally, add `@map` or `@goType` to
declare intent (the explicit choice shows up in PR review).

## Composites

| TypeSpec             | Proto                                                          |
| -------------------- | -------------------------------------------------------------- |
| `T[]`                | `repeated T`                                                   |
| `Record<V>`          | `map<string, V>`                                               |
| nullable `field?: T` | `optional T` (proto3 explicit presence) — not for repeated/map |

proto3 forbids nested maps and repeated map values; the resolver rejects them with
a `nested-map-rejected` diagnostic.

## Override decorators

| Decorator                  | Effect                         |
| -------------------------- | ------------------------------ |
| `@map("string", "Foo")`    | force `map<string, Foo>`       |
| `@goType("path.Type")`     | wire `bytes` + Go binding hint |
| `@rename("explicit_name")` | override snake_case field name |

See [decorators.md](./decorators.md) for full signatures.
