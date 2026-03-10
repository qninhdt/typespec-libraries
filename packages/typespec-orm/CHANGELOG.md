# Changelog

All notable changes to `@qninhdt/typespec-orm` will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-10

### Added

- `@data` decorator: marks a model as a non-DB data / form shape; emitters generate a plain struct / `BaseModel` instead of a table
- `@title` decorator: human-readable label for a form field - emitted as `form:"...,title=..."` (Go) and `Field(title=...)` (Python)
- `@placeholder` decorator: placeholder hint for a form field - emitted as `form:"...,placeholder=..."` (Go) and `Field(json_schema_extra={...})` (Python)
- `@inputType` decorator: sets the HTML input type for a `Scalar`; use `@@inputType(Model.field::type, "textarea")` for inline scalars and `@@inputType(SourceModel.prop::type, ...)` for lookup-typed fields
- Lookup-type validator inheritance: `@maxLength`, `@minLength`, `@format`, `@pattern`, `@minValue`, `@maxValue`, and `@doc` are now automatically inherited from the source property for lookup-typed fields (e.g. `inviteeEmail: User.email`)
- `collectDataModels(program)` helper for emitters to iterate all `@data` models
- Shared emitter utilities module `emitter-utils.ts`: `NUMERIC_TYPES`, `deduplicateParts`, `classifyProperties`

---

## [0.1.0] - 2026-03-10

### Added

- Initial release
- Model-level decorators: `@table`, `@compositeIndex`, `@compositeUnique`
- Property-level decorators: `@id`, `@map`, `@index`, `@unique`, `@autoIncrement`, `@autoCreateTime`, `@autoUpdateTime`, `@softDelete`, `@foreignKey`, `@onDelete`, `@onUpdate`, `@precision`, `@ignore`, `@relation`, `@default`
- Built-in scalars: `uuid`, `text`, `jsonb`, `serial`, `bigserial`
- `$onValidate` hook with 10 error diagnostics and 6 warning diagnostics
- Full TypeScript type declarations and source maps
