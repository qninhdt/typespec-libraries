/**
 * @qninhdt/typespec-gorm
 *
 * TypeSpec emitter that generates GORM (Go) model structs from
 * models decorated with @table and related decorators from @qninhdt/typespec-orm.
 *
 * Uses JSX components with @alloy-js/core for code generation,
 * following the same pattern as typespec-zod.
 */

import { render, writeOutput, SourceDirectory, SourceFile } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { collectTableModels, collectDataModels, generatedHeader } from "@qninhdt/typespec-orm";
import { reportDiagnostic, type GormEmitterOptions } from "./lib.js";
import { GormModelFile } from "./components/GormStruct.jsx";
import { GormDataFile } from "./components/GormDataStruct.jsx";

// ─── Emitter entry point ─────────────────────────────────────────────────────

export async function emit(context: EmitContext<GormEmitterOptions>): Promise<void> {
  const { program } = context;
  const outputDir = context.emitterOutputDir;
  const options = context.options;
  const isStandalone = options.standalone ?? false;
  const moduleName = options["module-name"];
  const packageName = options["package-name"] ?? "models";

  // Validate standalone options
  if (isStandalone && !moduleName) {
    reportDiagnostic(program, {
      code: "standalone-requires-module-name",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  const tables = collectTableModels(program);
  const dataModels = collectDataModels(program);

  if (tables.length === 0 && dataModels.length === 0) {
    reportDiagnostic(program, {
      code: "no-tables-found",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  // Build JSX component tree and render to output files
  const tree = (
    <SourceDirectory path=".">
      {isStandalone && (
        <>
          <SourceFile path="go.mod" filetype="go" printWidth={9999}>
            {`module ${moduleName}

go 1.22

require (
	github.com/google/uuid v1.6.0
	github.com/shopspring/decimal v1.4.0
	gorm.io/datatypes v1.2.7
	gorm.io/gorm v1.31.1
)

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/go-sql-driver/mysql v1.8.1 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	golang.org/x/text v0.20.0 // indirect
	gorm.io/driver/mysql v1.5.6 // indirect
)
`}
          </SourceFile>
          <SourceDirectory path="models">
            {tables.map(({ model, tableName }) => (
              <GormModelFile
                program={program}
                model={model}
                tableName={tableName}
                packageName={packageName}
              />
            ))}
            {dataModels.map(({ model, label }) => (
              <GormDataFile
                program={program}
                model={model}
                label={label}
                packageName={packageName}
              />
            ))}
          </SourceDirectory>
          <SourceFile path="models.go" filetype="go" printWidth={9999}>
            {`// ${generatedHeader}
// Source: https://github.com/qninhdt/typespec-libraries

// Package ${packageName} contains generated GORM models.
package ${packageName}

import (

  "gorm.io/gorm"

	"${moduleName}/models"
)

// Init initializes all models with GORM.
// Returns a slice of all registered models for auto-migration.
func Init(db *gorm.DB) error {
	return db.AutoMigrate(
${tables.map(({ model }) => `\t\t&models.${model.name}{}`).join(",\n")},
	)
}
`}
          </SourceFile>
        </>
      )}
      {!isStandalone &&
        tables.map(({ model, tableName }) => (
          <GormModelFile
            program={program}
            model={model}
            tableName={tableName}
            packageName={packageName}
          />
        ))}
      {!isStandalone &&
        dataModels.map(({ model, label }) => (
          <GormDataFile program={program} model={model} label={label} packageName={packageName} />
        ))}
    </SourceDirectory>
  );

  const output = render(tree);
  await writeOutput(output, outputDir);
}
