# Changelog

All notable changes to `@qninhdt/typespec-gorm` will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-16

### Changed

- Now uses TypeSpec's built-in `@key` decorator for primary keys instead of `@id`
- Explicit relation system: relations are only generated when `@foreignKey` and `@mappedBy` are explicitly declared
- Field ordering: key fields are now always placed at the top of the struct

### Added

- Validator support for exclusive bounds: `@minValueExclusive` → `gt=`, `@maxValueExclusive` → `lt=`
- Array item validators: `@minItems` → `min=`, `@maxItems` → `max=`

---

## [0.2.0] - 2026-03-10

### Added

- `@data` model support: generates a plain Go struct with `validate`, `json`, and `form` struct tags (no GORM tags, no `TableName()`)
- `form:"field,title=...,placeholder=..."` tags emitted from `@title` and `@placeholder` decorators on form fields
- Lookup-typed field inheritance: `max=`, `email`, `url`, etc. validator rules are now inherited from the source model property

### Changed

- Refactored internal property-classification loop into the shared `classifyProperties` utility from `@qninhdt/typespec-orm`
- Replaced inline `switch` for `@format` validators with a pre-built lookup table (`GO_FORMAT_VALIDATORS`)
- Moved `deduplicateParts` and `NUMERIC_TYPES` to shared `emitter-utils.ts`

---

## [0.1.0] - 2026-03-10

### Added

- Initial release
- Generates one `.go` file per `@table` model
- GORM struct tags, go-playground/validator `validate` tags
- Relation navigation properties with auto-injected FK scalar fields
- Composite index/unique support, enum types, soft delete
- Emitter diagnostics: `unsupported-type`, `missing-back-reference`, `emit-write-failed`, `no-tables-found`
- Configurable Go package name via `package-name` option
