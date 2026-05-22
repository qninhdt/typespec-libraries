---
"@qninhdt/typespec-orm": minor
"@qninhdt/typespec-ent": minor
"@qninhdt/typespec-sqlmodel": minor
"@qninhdt/typespec-zod": minor
"@qninhdt/typespec-dbml": minor
---

Production hardening for shared PostgreSQL package generation.

- Removed the local `@qninhdt/typespec-protobuf` emitter direction and migrated examples to upstream `@typespec/protobuf` with explicit `@field(number)` message fields.
- Removed MySQL/SQLite dialect options from Ent and SQLModel; database emitters now expose PostgreSQL-only behavior.
- Made unsupported type mappings errors in Ent, Zod, and DBML, matching SQLModel's strict behavior.
- Renamed generated SQLModel package metadata export to `target_metadata = SQLModel.metadata` and stopped inferring ORM `delete-orphan` ownership from DB cascade actions.
