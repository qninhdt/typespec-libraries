---
"@qninhdt/typespec-orm": minor
"@qninhdt/typespec-ent": minor
"@qninhdt/typespec-sqlmodel": minor
"@qninhdt/typespec-zod": minor
"@qninhdt/typespec-dbml": minor
"@qninhdt/typespec-protobuf": minor
---

Production hardening for shared PostgreSQL package generation.

- Renamed `@qninhdt/typespec-protobuf-openlet` to `@qninhdt/typespec-protobuf` and published it as a first-party emitter (ergonomic decorators, auto type mapping, cross-file imports, single-source `@entity` sharing with ent/sqlmodel, auto-generated buf configs).
- Removed MySQL/SQLite dialect options from Ent and SQLModel; database emitters now expose PostgreSQL-only behavior.
- Made unsupported type mappings errors in Ent, Zod, and DBML, matching SQLModel's strict behavior.
- Renamed generated SQLModel package metadata export to `target_metadata = SQLModel.metadata` and stopped inferring ORM `delete-orphan` ownership from DB cascade actions.
