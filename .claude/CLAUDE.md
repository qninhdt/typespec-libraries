# CLAUDE.md

This file provides guidance to Claude Opus (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeSpec monorepo that generates database models for Go (GORM) and Python (SQLModel) from TypeSpec schemas annotated with decorators. The project contains:

- **@qninhdt/typespec-orm** - Decorator library that provides `@table`, `@key`, `@index`, `@foreignKey`, `@mappedBy`, `@softDelete`, and other decorators for defining database schemas
- **@qninhdt/typespec-gorm** - Emitter that generates Go GORM structs
- **@qninhdt/typespec-sqlmodel** - Emitter that generates Python SQLModel classes
- **@qninhdt/typespec-dbml** - Emitter that generates DBML schema files

## Common Commands

```bash
pnpm install           # Install all dependencies
pnpm run build        # Build all packages
pnpm run test         # Run tests for all packages
pnpm run typecheck    # Type-check without emitting
pnpm run lint         # ESLint all source files
pnpm run format       # Prettier-format all files

# Run tests for a single package
cd packages/typespec-orm && pnpm run test

# Run tests with coverage
pnpm run test:coverage

# Compile example schemas to outputs/
pnpm run compile-examples
```

## Architecture

### Package Structure

Each package follows a similar structure:

- `src/` - TypeScript source code
- `test/` - Vitest test files
- `dist/` - Compiled output (generated)
- `lib/` - TypeSpec library files (.tsp)

### Key Source Files

- **typespec-orm/src/decorators.ts** - Defines all ORM decorators (`@table`, `@data`, `@index`, `@unique`, `@foreignKey`, `@mappedBy`, `@onDelete`, `@onUpdate`, `@autoCreateTime`, `@autoUpdateTime`, `@softDelete`, `@map`, `@precision`, `@ignore`, `@title`, `@placeholder`)
- **typespec-orm/src/validators.ts** - Compile-time validation logic for decorated models
- **typespec-orm/src/helpers.ts** - Shared helper functions used by emitters
- **typespec-gorm/src/emitter.tsx** - Go code generation logic
- **typespec-sqlmodel/src/emitter.tsx** - Python code generation logic
- **typespec-dbml/src/emitter.tsx** - DBML code generation logic

### Data Flow

1. User defines TypeSpec models with `@qninhdt/typespec-orm` decorators
2. Emitter packages read the decorated models at compile time
3. Each emitter transforms the decorators into target language code

### Testing

Tests use Vitest. Run tests with `pnpm run test` at the root or within a specific package.

### Examples

Example TypeSpec schemas are in `examples/` directory. Compiled outputs go to `outputs/`.
