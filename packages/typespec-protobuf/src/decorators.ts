import type {
  DecoratorContext,
  EnumMember,
  Interface,
  Model,
  ModelProperty,
  Namespace,
  Operation,
} from "@typespec/compiler";
import {
  ProtoPackageKey,
  ProtoServiceKey,
  StreamKey,
  ProtoFieldKey,
  ProtoImportKey,
  ProtoMapKey,
} from "./lib.js";

export function $protoPackage(context: DecoratorContext, target: Namespace, name: string): void {
  context.program.stateMap(ProtoPackageKey).set(target, name);
}

export function $protoService(context: DecoratorContext, target: Interface): void {
  context.program.stateMap(ProtoServiceKey).set(target, true);
}

export function $stream(context: DecoratorContext, target: Operation, mode: EnumMember): void {
  context.program.stateMap(StreamKey).set(target, mode.name);
}

export function $protoField(
  context: DecoratorContext,
  target: ModelProperty,
  number: number,
): void {
  context.program.stateMap(ProtoFieldKey).set(target, number);
}

export function $protoImport(context: DecoratorContext, target: Namespace, path: string): void {
  const existing = (context.program.stateMap(ProtoImportKey).get(target) as string[]) ?? [];
  existing.push(path);
  context.program.stateMap(ProtoImportKey).set(target, existing);
}

export function $protoMap(context: DecoratorContext, target: Model, protoType: string): void {
  context.program.stateMap(ProtoMapKey).set(target, protoType);
}
