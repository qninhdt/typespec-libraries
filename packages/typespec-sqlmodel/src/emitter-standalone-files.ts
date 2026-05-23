import { camelToSnake } from "@qninhdt/typespec-orm";

export function generatePyprojectToml(args: {
  libraryName: string;
  version: string;
  description?: string;
  topLevelNamespaces: readonly string[];
}): string {
  const { libraryName, version, description, topLevelNamespaces } = args;
  const packages = topLevelNamespaces.map((item) => `"${camelToSnake(item)}"`).join(", ");
  const descriptionLine =
    description !== undefined ? `description = ${JSON.stringify(description)}\n` : "";
  return `[project]
name = ${JSON.stringify(libraryName)}
version = ${JSON.stringify(version)}
${descriptionLine}requires-python = ">=3.10"
license = { text = "Proprietary" }
authors = [{ name = "Generated" }]
classifiers = [
    "Programming Language :: Python :: 3",
]
dependencies = [
    "atlas-provider-sqlalchemy>=0.3.0",
    "pydantic[email]>=2.0,<3.0",
    "sqlalchemy>=2.0,<3.0",
    "sqlmodel>=0.0.16,<1.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = [${packages}]
`;
}

export function generateStandaloneReadme(args: {
  libraryName: string;
  description?: string;
}): string {
  const { libraryName, description } = args;
  const blurb =
    description ??
    `Auto-generated SQLModel package emitted by @qninhdt/typespec-sqlmodel. Do not edit by hand — regenerate from your TypeSpec sources.`;
  return `# ${libraryName}

${blurb}

## Install

\`\`\`sh
pip install ${libraryName}
\`\`\`

This package was produced by \`@qninhdt/typespec-sqlmodel\`.
`;
}

export function generateAtlasHcl(): string {
  return `data "external_schema" "sqlmodel" {
  program = [
    "atlas-provider-sqlalchemy",
    "--path", ".",
    "--dialect", "postgresql"
  ]
}

env "sqlmodel" {
  src = data.external_schema.sqlmodel.url
  dev = "docker://postgres/16/dev?search_path=public"
  migration {
    dir = "file://migrations"
  }
  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}
`;
}
