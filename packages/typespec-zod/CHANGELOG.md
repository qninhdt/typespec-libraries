# Changelog

All notable changes to `@qninhdt/typespec-zod` will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
