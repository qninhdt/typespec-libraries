# @qninhdt/typespec-zod

TypeSpec emitter that generates Zod schemas from TypeSpec types.

## Installation

```bash
npm install @qninhdt/typespec-zod
```

## Usage

```bash
tsp compile . --emit @qninhdt/typespec-zod
```

## Features

- Generates Zod schemas from TypeSpec models
- Supports all TypeSpec scalar types
- Handles unions, enums, tuples, and arrays
- Generates discriminated unions when possible
- Supports model inheritance via `extends`
- Handles circular references with `z.lazy()`
- Supports constraints (min/max length, patterns, formats)
- Generates documentation via `describe()`

## License

MIT
