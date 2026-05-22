# github.com/example/game-platform/backend

Generated Ent schemas + Atlas migration scaffolding produced by
[`@qninhdt/typespec-ent`](https://github.com/qninhdt/typespec-libraries).

## Regenerate

This module is regenerated from TypeSpec sources. To rebuild it locally:

```sh
# 1. regenerate the Ent client from ./ent/schema
go generate ./ent

# 2. diff and apply migrations against the dev database declared in atlas.hcl
atlas migrate diff --env ent
atlas migrate apply --env ent
```

> Run `go mod tidy` after regeneration; this emitter does not write a `go.sum`,
> so dependency hashes need to be resolved by the Go toolchain on first build.
