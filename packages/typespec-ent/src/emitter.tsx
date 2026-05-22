import { render, writeOutput, SourceDirectory, SourceFile } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import {
  bootstrapEmitter,
  generatedHeader,
  getModelOwnProperties,
  getSchemaName,
  isBootstrapSuccess,
  type EnumMemberInfo,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { EntDataFile, collectGoEnumTypes } from "./components/EntDataStruct.jsx";
import { EntModelFile } from "./components/EntSchema.jsx";
import { buildGoEnumBlock } from "./components/ent-enum.js";
import { reportDiagnostic, type EntEmitterOptions } from "./lib.js";

export async function emit(context: EmitContext<EntEmitterOptions>): Promise<void> {
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const collectionStrategy = options["collection-strategy"];
  const goVersion = options["go-version"] ?? "1.24";
  const onUpdateEmitRawSql = options["on-update-emit-raw-sql"] ?? false;

  const result = bootstrapEmitter(context, {
    kinds: ["table", "mixin", "data"],
    include: options.include,
    exclude: options.exclude,
    autoIncludeDependencies: options["auto-include-dependencies"],
    standalone: options.standalone,
    libraryName: options["library-name"],
  });

  if (!isBootstrapSuccess(result)) {
    if (result.reason === "standalone-requires-library-name") {
      reportDiagnostic(context.program, {
        code: "standalone-requires-library-name",
        target: context.program.getGlobalNamespaceType(),
      });
    } else {
      reportDiagnostic(context.program, {
        code: "no-tables-found",
        target: context.program.getGlobalNamespaceType(),
      });
    }
    return;
  }

  const { program, graph, selection, namespaceGroups, isStandalone, libraryName } = result;
  const tables = selection.models.filter((model) => model.kind === "table");
  const schemaModels = selection.models.filter(
    (model) => model.kind === "table" || model.kind === "mixin",
  );

  // Collect every distinct Postgres schema referenced by @schema(...) on
  // included tables so atlas.hcl's `dev` URL can list them on `search_path`.
  // Preserve insertion order; default to "public" when nothing is set.
  const schemaNames = new Set<string>();
  for (const entry of tables) {
    const name = getSchemaName(program, entry.model);
    if (name) schemaNames.add(name);
  }
  if (schemaNames.size === 0) schemaNames.add("public");
  const atlasSchemas = [...schemaNames];

  const tree = (
    <SourceDirectory path=".">
      {tables.length > 0 && (
        <SourceFile path="atlas.hcl" filetype="hcl" printWidth={9999}>
          {generateAtlasHcl(atlasSchemas)}
        </SourceFile>
      )}
      {isStandalone && tables.length > 0 && (
        <>
          <SourceFile path="go.mod" filetype="go" printWidth={9999}>
            {`module ${libraryName}

go ${goVersion}

toolchain go${goVersion}.0

require (
\tentgo.io/ent v0.14.6
\tgithub.com/google/uuid v1.6.0
\tgithub.com/shopspring/decimal v1.4.0
)
`}
          </SourceFile>
          <SourceFile path="README.md" filetype="md" printWidth={9999}>
            {generateStandaloneReadme(libraryName ?? "", options.version)}
          </SourceFile>
          <SourceFile path=".gitignore" filetype="md" printWidth={9999}>
            {generateStandaloneGitignore()}
          </SourceFile>
          <SourceDirectory path="ent">
            <SourceFile path="generate.go" filetype="go" printWidth={9999}>
              {`// ${generatedHeader}
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
`}
            </SourceFile>
          </SourceDirectory>
        </>
      )}
      {schemaModels.length > 0 && (
        <SourceDirectory path="ent/schema">
          {schemaModels.map((model) => (
            <EntModelFile
              program={program}
              normalizedModel={model}
              modelLookup={graph.byModel}
              collectionStrategy={collectionStrategy}
              onUpdateEmitRawSql={onUpdateEmitRawSql}
            />
          ))}
        </SourceDirectory>
      )}
      {namespaceGroups.map((models) => {
        const dataModels = models.filter((model) => model.kind === "data");
        const enumFile = generateEnumsFile(dataModels);
        if (!enumFile && dataModels.length === 0) return null;
        return (
          <SourceDirectory path={models[0].namespaceDir}>
            {enumFile && (
              <SourceFile path="enums.go" filetype="go" printWidth={9999}>
                {enumFile}
              </SourceFile>
            )}
            {dataModels.map((model) => (
              <EntDataFile
                program={program}
                model={model.model}
                label={model.label ?? model.name}
                packageName={model.packageName}
                normalizedModel={model}
                modelLookup={graph.byModel}
                libraryName={libraryName}
                emitEnums={false}
              />
            ))}
          </SourceDirectory>
        );
      })}
    </SourceDirectory>
  );

  const output = render(tree);
  try {
    await writeOutput(output, outputDir);
  } catch (e) {
    reportDiagnostic(context.program, {
      code: "emit-write-failed",
      target: context.program.getGlobalNamespaceType(),
      format: { outputDir, error: e instanceof Error ? e.message : String(e) },
    });
  }
}

function generateEnumsFile(models: NormalizedOrmModel[]): string | undefined {
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

function generateAtlasHcl(schemas: string[]): string {
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

function generateStandaloneReadme(libraryName: string, version: string | undefined): string {
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

function generateStandaloneGitignore(): string {
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
