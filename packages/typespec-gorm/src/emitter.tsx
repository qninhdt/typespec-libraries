/**
 * @qninhdt/typespec-gorm
 *
 * TypeSpec emitter that generates namespace-grouped GORM packages from
 * models decorated with @table / @data from @qninhdt/typespec-orm.
 */

import { render, writeOutput, SourceDirectory, SourceFile } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import {
  generatedHeader,
  getLibraryLeafName,
  normalizeOrmGraph,
  selectModelsForEmitter,
} from "@qninhdt/typespec-orm";
import { GormDataFile } from "./components/GormDataStruct.jsx";
import { GormModelFile } from "./components/GormStruct.jsx";
import { reportDiagnostic, type GormEmitterOptions } from "./lib.js";

export async function emit(context: EmitContext<GormEmitterOptions>): Promise<void> {
  const { program } = context;
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const isStandalone = options.standalone ?? false;
  const libraryName = options["library-name"];

  if (isStandalone && !libraryName) {
    reportDiagnostic(program, {
      code: "standalone-requires-library-name",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  const graph = normalizeOrmGraph(program);
  const selection = selectModelsForEmitter(program, graph, {
    include: options.include,
    exclude: options.exclude,
    kinds: ["table", "data"],
  });
  const tables = selection.models.filter((model) => model.kind === "table");
  const dataModels = selection.models.filter((model) => model.kind === "data");

  if (tables.length === 0 && dataModels.length === 0) {
    reportDiagnostic(program, {
      code: "no-tables-found",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  const namespaceGroups = [...selection.byNamespace.values()].sort((a, b) =>
    a[0].namespace.localeCompare(b[0].namespace),
  );
  const rootPackage = getLibraryLeafName(libraryName ?? "generated");
  const tablePackages = [
    ...new Map(tables.map((model) => [model.namespaceDir, model])).values(),
  ].sort((a, b) => a.namespaceDir.localeCompare(b.namespaceDir));

  const tree = (
    <SourceDirectory path=".">
      {isStandalone && (
        <>
          <SourceFile path="go.mod" filetype="go" printWidth={9999}>
            {`module ${libraryName}

go 1.22

require (
\tgithub.com/google/uuid v1.6.0
\tgithub.com/shopspring/decimal v1.4.0
\tgorm.io/datatypes v1.2.7
\tgorm.io/gorm v1.31.1
)

require (
\tfilippo.io/edwards25519 v1.1.0 // indirect
\tgithub.com/go-sql-driver/mysql v1.8.1 // indirect
\tgithub.com/jinzhu/inflection v1.0.0 // indirect
\tgithub.com/jinzhu/now v1.1.5 // indirect
\tgolang.org/x/text v0.20.0 // indirect
\tgorm.io/driver/mysql v1.5.6 // indirect
)
`}
          </SourceFile>
          {tables.length > 0 && (
            <SourceFile path="models.go" filetype="go" printWidth={9999}>
              {`// ${generatedHeader}
// Source: https://github.com/qninhdt/typespec-libraries

// Package ${rootPackage} contains generated GORM models.
package ${rootPackage}

import (
\t"gorm.io/gorm"
${tablePackages
  .map((model) => `\t${model.namespacePath.join("_")} "${libraryName}/${model.namespaceDir}"`)
  .join("\n")}
)

// Init initializes all models with GORM.
// Returns a slice of all registered models for auto-migration.
func Init(db *gorm.DB) error {
\treturn db.AutoMigrate(
${tables.map((model) => `\t\t&${model.namespacePath.join("_")}.${model.model.name}{}`).join(",\n")},
\t)
}
`}
            </SourceFile>
          )}
        </>
      )}
      {namespaceGroups.map((models) => (
        <SourceDirectory path={models[0].namespaceDir}>
          {models
            .filter((model) => model.kind === "table")
            .map((model) => (
              <GormModelFile
                program={program}
                normalizedModel={model}
                modelLookup={graph.byModel}
                libraryName={libraryName}
              />
            ))}
          {models
            .filter((model) => model.kind === "data")
            .map((model) => (
              <GormDataFile
                program={program}
                model={model.model}
                label={model.label ?? model.name}
                packageName={model.packageName}
              />
            ))}
        </SourceDirectory>
      ))}
    </SourceDirectory>
  );

  const output = render(tree);
  await writeOutput(output, outputDir);
}
