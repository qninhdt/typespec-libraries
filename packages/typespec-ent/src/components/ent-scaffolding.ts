import {
  generatedHeader,
  getModelOwnProperties,
  type EnumMemberInfo,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { buildGoEnumBlock } from "./ent-enum.js";
import { collectGoEnumTypes } from "./ent-data-fields.js";

/** Render the `atlas.hcl` env block listing every Postgres schema in use. */
export function generateAtlasHcl(schemas: string[]): string {
  const list = schemas.length > 0 ? schemas : ["public"];
  // search_path accepts a comma-separated list; the `schemas` array tells
  // Atlas which schemas to manage (it diffs only what's listed).
  const searchPath = list.join(",");
  const schemasLiteral = list.map((s) => `"${s}"`).join(", ");
  return `env "ent" {
  schema {
    src = "ent://ent/schema"
  }
  schemas = [${schemasLiteral}]
  dev = "docker://postgres/16/dev?search_path=${searchPath}"
  migration {
    dir = "file://migrations"
  }
  format {
    migrate {
      diff = "{{ sql . \\"  \\" }}"
    }
  }
}
`;
}

/** Render the `go.mod` for a standalone Ent module. */
export function generateStandaloneGoMod(libraryName: string, goVersion: string): string {
  return `module ${libraryName}

go ${goVersion}

toolchain go${goVersion}.0

require (
\tentgo.io/ent v0.14.6
\tgithub.com/google/uuid v1.6.0
\tgithub.com/shopspring/decimal v1.4.0
)
`;
}

/** Render `ent/generate.go` with the `go:generate` directive that drives Ent. */
export function generateEntGenerateGo(): string {
  return `// ${generatedHeader}
// Source: https://github.com/qninhdt/typespec-libraries

// Package ent hosts the generated Ent schema package.
//
// Typical workflow after regenerating from TypeSpec:
//
//   1. go generate ./ent          # regenerate Ent client from ./schema
//   2. atlas migrate diff --env ent
//   3. atlas migrate apply --env ent
//
// The atlas.hcl at the module root defines the "ent" environment used above;
// run \`atlas migrate diff --help\` for additional flags (e.g. --to / --baseline).

package ent

//go:generate go run -mod=mod entgo.io/ent/cmd/ent generate ./schema
`;
}

/** Render the README emitted at the root of a standalone module. */
export function generateStandaloneReadme(libraryName: string, version: string | undefined): string {
  const versionLine = version ? ` (version \`${version}\`)` : "";
  return `# ${libraryName}${versionLine}

Generated Ent schemas + Atlas migration scaffolding produced by
[\`@qninhdt/typespec-ent\`](https://github.com/qninhdt/typespec-libraries).

## Regenerate

This module is regenerated from TypeSpec sources. To rebuild it locally:

\`\`\`sh
# 1. regenerate the Ent client from ./ent/schema
go generate ./ent

# 2. diff and apply migrations against the dev database declared in atlas.hcl
atlas migrate diff --env ent
atlas migrate apply --env ent
\`\`\`

> Run \`go mod tidy\` after regeneration; this emitter does not write a \`go.sum\`,
> so dependency hashes need to be resolved by the Go toolchain on first build.
`;
}

/** Render a tight `.gitignore` for the standalone module. */
export function generateStandaloneGitignore(): string {
  // Keep this list tight: ignore local-only artifacts but never the migration
  // metadata (e.g. atlas.sum) that should travel with the repo.
  return `# Local environment
.env
.env.*
!.env.example

# Local databases / scratch files
dev.db
*.db-journal
*.tmp

# Editor / OS
.DS_Store
.idea/
.vscode/
`;
}

/**
 * Build a per-namespace `enums.go` file aggregating every enum referenced by
 * the namespace's `@data` models. Returns undefined when the namespace has no
 * enums to emit.
 */
export function generateEnumsFile(models: NormalizedOrmModel[]): string | undefined {
  const enumTypes = new Map<string, EnumMemberInfo[]>();
  for (const model of models) {
    for (const prop of getModelOwnProperties(model.model)) {
      collectGoEnumTypes(prop.type, enumTypes);
    }
  }

  const enumLines = buildGoEnumBlock(enumTypes);
  if (enumLines.length === 0 || models.length === 0) {
    return undefined;
  }

  return `// ${generatedHeader}
// Source: https://github.com/qninhdt/typespec-libraries

package ${models[0].packageName}

${enumLines.join("\n")}
`;
}
