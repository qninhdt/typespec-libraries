# @qninhdt/typespec-protobuf

## 0.6.0

### Minor Changes

- c43429e: Production hardening for shared PostgreSQL package generation.
  - Renamed `@qninhdt/typespec-protobuf-openlet` to `@qninhdt/typespec-protobuf` and published it as a first-party emitter (ergonomic decorators, auto type mapping, cross-file imports, single-source `@entity` sharing with ent/sqlmodel, auto-generated buf configs).
  - Removed MySQL/SQLite dialect options from Ent and SQLModel; database emitters now expose PostgreSQL-only behavior.
  - Made unsupported type mappings errors in Ent, Zod, and DBML, matching SQLModel's strict behavior.
  - Renamed generated SQLModel package metadata export to `target_metadata = SQLModel.metadata` and stopped inferring ORM `delete-orphan` ownership from DB cascade actions.

### Patch Changes

- Updated dependencies [c43429e]
  - @qninhdt/typespec-orm@0.6.0
