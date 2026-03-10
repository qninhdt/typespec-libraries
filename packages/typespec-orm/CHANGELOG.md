# Changelog

All notable changes to `@qninhdt/typespec-orm` will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-10

### Added

- Initial release
- Model-level decorators: `@table`, `@compositeIndex`, `@compositeUnique`
- Property-level decorators: `@id`, `@map`, `@index`, `@unique`, `@autoIncrement`, `@autoCreateTime`, `@autoUpdateTime`, `@softDelete`, `@foreignKey`, `@onDelete`, `@onUpdate`, `@precision`, `@ignore`, `@relation`, `@default`
- Built-in scalars: `uuid`, `text`, `jsonb`, `serial`, `bigserial`
- `$onValidate` hook with 10 error diagnostics and 6 warning diagnostics
- Full TypeScript type declarations and source maps
