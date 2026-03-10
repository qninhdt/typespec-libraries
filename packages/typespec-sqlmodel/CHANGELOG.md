# Changelog

All notable changes to `@qninhdt/typespec-sqlmodel` will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-10

### Added

- Initial release
- Generates one `.py` file per `@table` model plus `__init__.py`
- SQLModel `Field()` with full Pydantic v2 constraints
- SQLAlchemy `Column(...)` for types needing explicit SA types
- Relation navigation properties via `Relationship` with `back_populates`
- Composite indexes and unique constraints via `__table_args__`
- Enum types as `class X(str, Enum)` with `SAEnum`
- `@format("email")` / `@format("url")` → Pydantic `EmailStr` / `AnyUrl`
- Emitter diagnostics: `unsupported-type`, `missing-back-reference`, `emit-write-failed`, `no-tables-found`
- Configurable module name via `module-name` option
