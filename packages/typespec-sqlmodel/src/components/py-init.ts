import { pythonTripleQuotedString, toPythonIdentifier } from "./py-field-utils.js";

export interface PyInitModelExport {
  name: string;
  moduleFile: string;
}

export interface PyInitOptions {
  moduleName: string;
  models?: PyInitModelExport[];
  childPackages?: string[];
  includeMetadata?: boolean;
  importAssociations?: boolean;
  reportCollision?: (info: { name: string; packageName: string }) => void;
}

export function generateInit(options: PyInitOptions): string {
  const FOUR_SPACES = "    ";
  const imports: string[] = [];
  const allExports: string[] = [];
  const seen = new Set<string>();
  const pushExport = (name: string) => {
    if (seen.has(name)) {
      options.reportCollision?.({ name, packageName: options.moduleName });
      return;
    }
    seen.add(name);
    allExports.push(`${FOUR_SPACES}"${name}",`);
  };

  if (options.includeMetadata) {
    imports.push("from sqlmodel import SQLModel");
  }

  if (options.importAssociations) {
    imports.push("from . import __associations__");
  }

  for (const childPackage of options.childPackages ?? []) {
    const safeName = toPythonIdentifier(childPackage);
    if (safeName === childPackage) {
      imports.push(`from . import ${childPackage}`);
    } else {
      imports.push(`from . import ${childPackage} as ${safeName}`);
    }
    pushExport(safeName);
  }

  for (const model of options.models ?? []) {
    const safeName = toPythonIdentifier(model.name);
    if (safeName === model.name) {
      imports.push(`from .${model.moduleFile} import ${model.name}`);
    } else {
      imports.push(`from .${model.moduleFile} import ${model.name} as ${safeName}`);
    }
    pushExport(safeName);
  }

  let code = `${pythonTripleQuotedString(`${options.moduleName} - auto-generated models. DO NOT EDIT.`)}\n\n`;

  if (imports.length > 0) {
    code += imports.join("\n");
    code += "\n\n";
  }

  if (options.includeMetadata) {
    code += "target_metadata = SQLModel.metadata\n\n";
    pushExport("target_metadata");
  }

  code += "__all__ = [\n";
  code += allExports.join("\n");
  code += "\n]\n";

  return code;
}
