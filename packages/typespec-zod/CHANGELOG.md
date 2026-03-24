# Changelog

All notable changes to `@qninhdt/typespec-zod` will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-03-24

### Added

- Namespace-first Zod emission for `@data` models with shared `include` / `exclude` filtering.
- Root barrel generation plus inline inferred type aliases and `*Meta` exports emitted in the same render pass.
- Better lookup-type inheritance for data-model constraints and richer example coverage for public form models.

### Changed

- Standalone output now uses `library-name` and writes namespace-derived files under `src/`.
- Non-standalone output now follows the same namespace-derived file structure without extra package metadata.
- The emitter now relies on the shared normalized ORM graph instead of legacy per-emitter discovery and post-write mutation.

### Removed

- Legacy `filename` and `package-name` options.
- The old post-write alias patching flow.

## [0.4.0] - 2026-03-23

### Added

- Initial release of the Zod emitter
- Generates TypeScript Zod validation schemas from TypeSpec `@data` models
- Full test suite using Vitest covering data models, objects, arrays, enums, literals, constraints, and standalone mode
- Standalone mode: generates a complete, self-contained npm package with `package.json`, `tsconfig.json`, TypeScript declarations, and `z.infer` type exports
- Configurable options: `standalone`, `package-name`, `filename`, `includeTemplateDeclaration`, `useDiscriminatedUnions`, `emitDescriptions`

### Features

- `@minLength` / `@maxLength` → `.min()` / `.max()` on strings
- `@format("email")` → `.email()`, `@format("url")` → `.url()`
- `@pattern` → `.regex()`
- `@minValue` → `.nonnegative()` / `.gte()`, `@maxValue` → `.lte()`
- `@minValueExclusive` → `.gt()`, `@maxValueExclusive` → `.lt()`
- `@minItems` / `@maxItems` → `.min()` / `.max()` on arrays
- Optional fields → `.optional()`
- Default values → `.default()`
- Enums, literals, tuples, unions, and nested objects
- Generated `z.infer<>` type aliases for full type safety

---

## [0.1.0] - 2026-03-10

### Added

- Pre-release development version
