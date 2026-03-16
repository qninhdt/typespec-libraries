# @qninhdt/typespec-dbml

[![npm version](https://img.shields.io/npm/v/@qninhdt/typespec-dbml)](https://www.npmjs.com/package/@qninhdt/typespec-dbml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

TypeSpec emitter that generates **DBML (Database Markup Language)** from your TypeSpec schemas annotated with `@qninhdt/typespec-orm`.

---

## Installation

```bash
pnpm add -D @qninhdt/typespec-dbml @qninhdt/typespec-orm
# or
npm install --save-dev @qninhdt/typespec-dbml @qninhdt/typespec-orm
```

---

## Configuration

Add the emitter to your `tspconfig.yaml`:

```yaml
emit:
  - "@qninhdt/typespec-dbml"

options:
  "@qninhdt/typespec-dbml":
    filename: "schema"
```

---

## Example

### Input - TypeSpec schema

```typescript
import "@qninhdt/typespec-orm";
using Qninhdt.Orm;

enum PostStatus {
  draft: "draft",
  published: "published",
}

@table("users")
model User {
  @key id: uuid;
  name: string;
}

@table("posts")
model Post {
  @key id: uuid;
  title: string;
  body: text;
  @index status: PostStatus;
  @foreignKey("author_id") @onDelete("CASCADE") author: User;
  authorStatus: composite<"author_id", "status">;
}
```

### Output - DBML

```dbml
// Database Schema

Enum PostStatus {
  draft
  published
}

Table users {
  id uuid [pk, not null]
  name varchar(255) [not null]
}

Table posts {
  id uuid [pk, not null]
  title varchar(255) [not null]
  body text [not null]
  author_id uuid [not null]
  status PostStatus

  indexes {
    (author_id, status)
    status
  }
}

Ref: posts.author_id > users.id
```

---

## Output

The emitter generates a single `{filename}.dbml` file (default: `schema.dbml`) containing:

- All table definitions
- All enum definitions
- Indexes and unique constraints
- Foreign key references

---

## TypeSpec → DBML Type Mapping

| TypeSpec type | DBML type   |
| ------------- | ----------- |
| `uuid`        | `uuid`      |
| `string`      | `varchar`   |
| `text`        | `text`      |
| `boolean`     | `boolean`   |
| `int*`        | `integer`   |
| `uint*`       | `integer`   |
| `float32`     | `float`     |
| `float64`     | `double`    |
| `decimal`     | `decimal`   |
| `serial`      | `serial`    |
| `bigserial`   | `bigserial` |
| `utcDateTime` | `timestamp` |
| `plainDate`   | `date`      |
| `plainTime`   | `time`      |
| `duration`    | `interval`  |
| `bytes`       | `blob`      |
| `jsonb`       | `jsonb`     |

---

## Emitter Options

| Option     | Type     | Default  | Description                      |
| ---------- | -------- | -------- | -------------------------------- |
| `filename` | `string` | `schema` | Filename for generated DBML file |

---

## License

[MIT](../../LICENSE) © [Nguyen Quang Ninh](https://github.com/qninhdt)
