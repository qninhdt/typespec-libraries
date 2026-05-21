import { render, writeOutput, SourceDirectory, SourceFile } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import {
  bootstrapEmitter,
  generatedHeader,
  getModelOwnProperties,
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

  const result = bootstrapEmitter(context, {
    kinds: ["table", "mixin", "data"],
    include: options.include,
    exclude: options.exclude,
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

  const tree = (
    <SourceDirectory path=".">
      {tables.length > 0 && (
        <SourceFile path="atlas.hcl" filetype="hcl" printWidth={9999}>
          {generateAtlasHcl()}
        </SourceFile>
      )}
      {isStandalone && (
        <>
          <SourceFile path="go.mod" filetype="go" printWidth={9999}>
            {`module ${libraryName}

go 1.22

require (
\tentgo.io/ent v0.14.6
\tgithub.com/google/uuid v1.6.0
\tgithub.com/shopspring/decimal v1.4.0
)
`}
          </SourceFile>
          <SourceDirectory path="ent">
            <SourceFile path="generate.go" filetype="go" printWidth={9999}>
              {`// ${generatedHeader}
// Source: https://github.com/qninhdt/typespec-libraries

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
            />
          ))}
        </SourceDirectory>
      )}
      {namespaceGroups.map((models) => {
        const dataModels = models.filter((model) => model.kind === "data");
        const enumFile = generateEnumsFile(dataModels);
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
  await writeOutput(output, outputDir);
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

function generateAtlasHcl(): string {
  return `env "ent" {
  schema {
    src = "ent://ent/schema"
  }
  dev = "docker://postgres/16/dev?search_path=public"
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
