# Changelog

All notable changes to `@qninhdt/typespec-gorm` will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-10

### Added

- Initial release
- Generates one `.go` file per `@table` model
- GORM struct tags, go-playground/validator `validate` tags
- Relation navigation properties with auto-injected FK scalar fields
- Composite index/unique support, enum types, soft delete
- Emitter diagnostics: `unsupported-type`, `missing-back-reference`, `emit-write-failed`, `no-tables-found`
- Configurable Go package name via `package-name` option
