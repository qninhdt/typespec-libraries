import { describe, expect, it } from "vitest";
import type { DecoratorContext, Model, ModelProperty, Program, Scalar } from "@typespec/compiler";
import {
  $autoCreateTime,
  $autoIncrement,
  $autoUpdateTime,
  $check,
  $data,
  $foreignKey,
  $ignore,
  $index,
  $inputType,
  $manyToMany,
  $map,
  $mappedBy,
  $onDelete,
  $onUpdate,
  $placeholder,
  $precision,
  $softDelete,
  $table,
  $tableMixin,
  $title,
  $unique,
} from "../src/decorators.js";
import {
  AutoCreateTimeKey,
  AutoIncrementKey,
  AutoUpdateTimeKey,
  CheckKey,
  DataKey,
  ForeignKeyKey,
  IgnoreKey,
  IndexKey,
  InputTypeKey,
  ManyToManyKey,
  MapKey,
  MappedByKey,
  OnDeleteKey,
  OnUpdateKey,
  PlaceholderKey,
  PrecisionKey,
  SoftDeleteKey,
  TableKey,
  TableMixinKey,
  TitleKey,
  UniqueKey,
} from "../src/lib.js";

function createDecoratorContext(): {
  context: DecoratorContext;
  program: Program;
  model: Model;
  prop: ModelProperty;
  scalar: Scalar;
} {
  const maps = new Map<symbol, Map<unknown, unknown>>();
  const program = {
    stateMap(key: symbol) {
      const existing = maps.get(key) ?? new Map();
      maps.set(key, existing);
      return existing;
    },
  } as Program;

  return {
    context: { program } as DecoratorContext,
    program,
    model: { kind: "Model", name: "User" } as Model,
    prop: { kind: "ModelProperty", name: "email" } as ModelProperty,
    scalar: { kind: "Scalar", name: "email" } as Scalar,
  };
}

describe("direct decorator setters", () => {
  it("stores model-level decorator state", () => {
    const { context, program, model } = createDecoratorContext();

    $table(context, model, "users");
    $tableMixin(context, model);
    $data(context, model, "User Form");

    expect(program.stateMap(TableKey).get(model)).toBe("users");
    expect(program.stateMap(TableMixinKey).get(model)).toBe(true);
    expect(program.stateMap(DataKey).get(model)).toBe("User Form");
  });

  it("stores property-level decorator state", () => {
    const { context, program, prop } = createDecoratorContext();

    $map(context, prop, "email_address");
    $index(context, prop, "users_email_idx");
    $unique(context, prop);
    $check(context, prop, "positive", "value > 0");
    $autoIncrement(context, prop);
    $softDelete(context, prop);
    $foreignKey(context, prop, "userId", "id");
    $mappedBy(context, prop, "user");
    $manyToMany(context, prop, "user_roles");
    $autoCreateTime(context, prop);
    $autoUpdateTime(context, prop);
    $precision(context, prop, 10, 2);
    $onDelete(context, prop, "CASCADE");
    $onUpdate(context, prop, "CASCADE");
    $ignore(context, prop);
    $title(context, prop, "Email");
    $placeholder(context, prop, "Enter email");

    expect(program.stateMap(MapKey).get(prop)).toBe("email_address");
    expect(program.stateMap(IndexKey).get(prop)).toBe("users_email_idx");
    expect(program.stateMap(UniqueKey).get(prop)).toBe(true);
    expect(program.stateMap(CheckKey).get(prop)).toEqual({
      name: "positive",
      expression: "value > 0",
    });
    expect(program.stateMap(AutoIncrementKey).get(prop)).toBe(true);
    expect(program.stateMap(SoftDeleteKey).get(prop)).toBe(true);
    expect(program.stateMap(ForeignKeyKey).get(prop)).toEqual({ field: "userId", target: "id" });
    expect(program.stateMap(MappedByKey).get(prop)).toBe("user");
    expect(program.stateMap(ManyToManyKey).get(prop)).toBe("user_roles");
    expect(program.stateMap(AutoCreateTimeKey).get(prop)).toBe(true);
    expect(program.stateMap(AutoUpdateTimeKey).get(prop)).toBe(true);
    expect(program.stateMap(PrecisionKey).get(prop)).toEqual({ precision: 10, scale: 2 });
    expect(program.stateMap(OnDeleteKey).get(prop)).toBe("CASCADE");
    expect(program.stateMap(OnUpdateKey).get(prop)).toBe("CASCADE");
    expect(program.stateMap(IgnoreKey).get(prop)).toBe(true);
    expect(program.stateMap(TitleKey).get(prop)).toBe("Email");
    expect(program.stateMap(PlaceholderKey).get(prop)).toBe("Enter email");
  });

  it("stores scalar-level input type state", () => {
    const { context, program, scalar } = createDecoratorContext();

    $inputType(context, scalar, "email");

    expect(program.stateMap(InputTypeKey).get(scalar)).toBe("email");
  });
});
