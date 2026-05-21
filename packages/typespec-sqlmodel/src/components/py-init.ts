import { pythonTripleQuotedString } from "./py-field-utils.js";

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
}

export function generateInit(options: PyInitOptions): string {
  const FOUR_SPACES = "    ";
  const imports: string[] = [];
  const allExports: string[] = [];

  if (options.includeMetadata) {
    imports.push("from sqlmodel import SQLModel");
  }

  if (options.importAssociations) {
    imports.push("from . import __associations__");
  }

  for (const childPackage of options.childPackages ?? []) {
    imports.push(`from . import ${childPackage}`);
    allExports.push(`${FOUR_SPACES}"${childPackage}",`);
  }

  for (const model of options.models ?? []) {
    imports.push(`from .${model.moduleFile} import ${model.name}`);
    allExports.push(`${FOUR_SPACES}"${model.name}",`);
  }

  let code = `${pythonTripleQuotedString(`${options.moduleName} - auto-generated models. DO NOT EDIT.`)}\n\n`;

  if (imports.length > 0) {
    code += imports.join("\n");
    code += "\n\n";
  }

  if (options.includeMetadata) {
    code += "metadata = SQLModel.metadata\n\n";
    allExports.push(`${FOUR_SPACES}"metadata",`);
  }

  code += "__all__ = [\n";
  code += allExports.join("\n");
  code += "\n]\n";

  return code;
}
