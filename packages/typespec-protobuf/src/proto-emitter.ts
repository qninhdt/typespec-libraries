import type { EmitContext, Model, Namespace, Program } from "@typespec/compiler";
import { isTable, isTableMixin } from "@qninhdt/typespec-orm";
import { ProtoPackageKey, ProtoFieldKey, ProtoImportKey, ProtoMapKey } from "./lib.js";
import type { ProtoEmitterOptions } from "./lib.js";
import { resolveProtoType, collectImports, type ProtoTypeRef } from "./type-mapping.js";
import { resolveProtoEnum, camelToSnakeCase, type ProtoEnum } from "./enum-mapping.js";
import { isProtoService, resolveProtoService, type ProtoService } from "./proto-service.js";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

interface ProtoFile {
  packageName: string;
  filePath: string;
  content: string;
}

interface ProtoMessage {
  name: string;
  fields: ProtoMessageField[];
}

interface ProtoMessageField {
  name: string;
  type: ProtoTypeRef;
  number: number;
  isOptional: boolean;
  isRepeated: boolean;
}

export async function $onEmit(context: EmitContext<ProtoEmitterOptions>): Promise<void> {
  const program = context.program;
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;

  const files = buildProtoFiles(program);

  for (const file of files) {
    const fullPath = join(outputDir, file.filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, "utf-8");
  }
}

function buildProtoFiles(program: Program): ProtoFile[] {
  const files: ProtoFile[] = [];
  const packageNamespaces = collectPackageNamespaces(program);

  for (const [namespace, packageName] of packageNamespaces) {
    const file = buildProtoFile(program, namespace, packageName);
    if (file) {
      files.push(file);
    }
  }

  return files;
}

function collectPackageNamespaces(program: Program): Map<Namespace, string> {
  const result = new Map<Namespace, string>();
  const stateMap = program.stateMap(ProtoPackageKey);

  for (const [target, value] of stateMap) {
    if ((target as any).kind === "Namespace") {
      result.set(target as Namespace, value as string);
    }
  }

  return result;
}

function buildProtoFile(
  program: Program,
  namespace: Namespace,
  packageName: string,
): ProtoFile | null {
  const messages = collectMessages(program, namespace);
  const enums = collectEnums(program, namespace);
  const services = collectServices(program, namespace);
  const explicitImports = getExplicitImports(program, namespace);

  if (messages.length === 0 && enums.length === 0 && services.length === 0) {
    return null;
  }

  const allTypeRefs: ProtoTypeRef[] = [];
  for (const msg of messages) {
    for (const field of msg.fields) {
      allTypeRefs.push(field.type);
    }
  }
  for (const svc of services) {
    for (const method of svc.methods) {
      allTypeRefs.push(...method.inputImports);
      allTypeRefs.push(...method.outputImports);
    }
  }

  const imports = [...new Set([...collectImports(allTypeRefs), ...explicitImports])].sort();
  const content = renderProtoFile(packageName, imports, enums, messages, services);
  const filePath = packageNameToPath(packageName);

  return { packageName, filePath, content };
}

function collectMessages(program: Program, namespace: Namespace): ProtoMessage[] {
  const messages: ProtoMessage[] = [];
  const protoMapState = program.stateMap(ProtoMapKey);

  for (const [, model] of namespace.models) {
    if (protoMapState.has(model)) continue;
    if (isTable(program, model)) continue;
    if (isTableMixin(program, model)) continue;
    const msg = buildMessage(program, model);
    if (msg) messages.push(msg);
  }

  return messages;
}

function buildMessage(program: Program, model: Model): ProtoMessage | null {
  if (!model.name) return null;

  const fields: ProtoMessageField[] = [];
  let fieldNumber = 1;
  const protoFieldState = program.stateMap(ProtoFieldKey);
  const usedNumbers = new Set<number>();

  for (const prop of model.properties.values()) {
    const explicitNumber = protoFieldState.get(prop) as number | undefined;
    const typeRef = resolveProtoType(program, prop.type);

    if (!explicitNumber) {
      while (usedNumbers.has(fieldNumber)) {
        fieldNumber++;
      }
    }

    const assignedNumber = explicitNumber ?? fieldNumber;
    usedNumbers.add(assignedNumber);

    fields.push({
      name: camelToSnakeCase(prop.name),
      type: typeRef,
      number: assignedNumber,
      isOptional: prop.optional && !typeRef.isRepeated,
      isRepeated: typeRef.isRepeated ?? false,
    });

    if (!explicitNumber) {
      fieldNumber++;
    } else {
      fieldNumber = Math.max(fieldNumber, assignedNumber + 1);
    }
  }

  return { name: model.name, fields };
}

function collectEnums(program: Program, namespace: Namespace): ProtoEnum[] {
  const enums: ProtoEnum[] = [];

  for (const [, enumType] of namespace.enums) {
    enums.push(resolveProtoEnum(program, enumType));
  }

  return enums;
}

function collectServices(program: Program, namespace: Namespace): ProtoService[] {
  const services: ProtoService[] = [];

  for (const [, iface] of namespace.interfaces) {
    if (isProtoService(program, iface)) {
      services.push(resolveProtoService(program, iface));
    }
  }

  return services;
}

function getExplicitImports(program: Program, namespace: Namespace): string[] {
  return (program.stateMap(ProtoImportKey).get(namespace) as string[]) ?? [];
}

function renderProtoFile(
  packageName: string,
  imports: string[],
  enums: ProtoEnum[],
  messages: ProtoMessage[],
  services: ProtoService[],
): string {
  const lines: string[] = [];

  lines.push(`syntax = "proto3";`, "");
  lines.push(`package ${packageName};`, "");

  if (imports.length > 0) {
    for (const imp of imports) {
      lines.push(`import "${imp}";`);
    }
    lines.push("");
  }

  for (const protoEnum of enums) {
    lines.push(...renderEnum(protoEnum), "");
  }

  for (const message of messages) {
    lines.push(...renderMessage(message), "");
  }

  for (const service of services) {
    lines.push(...renderService(service), "");
  }

  return lines.join("\n");
}

function renderEnum(protoEnum: ProtoEnum): string[] {
  const lines: string[] = [];
  lines.push(`enum ${protoEnum.name} {`);
  for (const member of protoEnum.members) {
    lines.push(`  ${member.name} = ${member.value};`);
  }
  lines.push("}");
  return lines;
}

function renderMessage(message: ProtoMessage): string[] {
  const lines: string[] = [];
  lines.push(`message ${message.name} {`);
  for (const field of message.fields) {
    const prefix = field.isRepeated ? "repeated " : field.isOptional ? "optional " : "";
    const typeName = field.type.name;
    lines.push(`  ${prefix}${typeName} ${field.name} = ${field.number};`);
  }
  lines.push("}");
  return lines;
}

function renderService(service: ProtoService): string[] {
  const lines: string[] = [];
  lines.push(`service ${service.name} {`);
  for (const method of service.methods) {
    const input = method.clientStreaming ? `stream ${method.inputType}` : method.inputType;
    const output = method.serverStreaming ? `stream ${method.outputType}` : method.outputType;
    lines.push(`  rpc ${method.name}(${input}) returns (${output});`);
  }
  lines.push("}");
  return lines;
}

function packageNameToPath(packageName: string): string {
  const parts = packageName.split(".");
  const fileName = parts[parts.length - 1] + ".proto";
  return join(...parts.slice(0, -1), fileName);
}
