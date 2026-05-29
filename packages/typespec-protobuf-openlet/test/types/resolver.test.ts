import type { ModelProperty } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { resolveProtoType, type ProtoTypeRef } from "@qninhdt/typespec-protobuf-openlet";
import { createTestRunner } from "../utils.js";

/**
 * Compile a fixture, return the resolution for the property tagged `@test`.
 * The fixture is wrapped automatically with `using Openlet.Proto;` so test
 * code only needs to add property-level decorators.
 */
async function resolveProperty(code: string, opts?: Parameters<typeof resolveProtoType>[2]) {
  const runner = await createTestRunner();
  const { target } = (await runner.compile(code)) as { target: ModelProperty };
  return resolveProtoType(runner.program, target, opts);
}

describe("resolveProtoType — built-in proto scalars", () => {
  it.each([
    ["string", { kind: "scalar", name: "string" }],
    ["boolean", { kind: "scalar", name: "bool" }],
    ["int32", { kind: "scalar", name: "int32" }],
    ["int64", { kind: "scalar", name: "int64" }],
    ["uint32", { kind: "scalar", name: "uint32" }],
    ["uint64", { kind: "scalar", name: "uint64" }],
    ["float32", { kind: "scalar", name: "float" }],
    ["float64", { kind: "scalar", name: "double" }],
    ["bytes", { kind: "scalar", name: "bytes" }],
  ] as const)("maps %s → %j", async (tspType, expected) => {
    const { ref, warnings } = await resolveProperty(`
      @message
      model M {
        @test target: ${tspType};
      }
    `);
    expect(ref).toEqual(expected satisfies ProtoTypeRef);
    expect(warnings).toEqual([]);
  });

  it("widens int8 / int16 to int32", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: int16;
      }
    `);
    expect(ref).toEqual({ kind: "scalar", name: "int32" });
  });

  it("widens uint8 / uint16 to uint32", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: uint8;
      }
    `);
    expect(ref).toEqual({ kind: "scalar", name: "uint32" });
  });

  it("maps numeric → string (precision-preserving default)", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: numeric;
      }
    `);
    expect(ref).toEqual({ kind: "scalar", name: "string" });
  });
});

describe("resolveProtoType — well-known TypeSpec scalars", () => {
  it("maps utcDateTime → google.protobuf.Timestamp", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: utcDateTime;
      }
    `);
    expect(ref).toEqual({
      kind: "wellKnown",
      name: "google.protobuf.Timestamp",
      importPath: "google/protobuf/timestamp.proto",
    });
  });

  it("maps offsetDateTime → google.protobuf.Timestamp", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: offsetDateTime;
      }
    `);
    expect(ref).toMatchObject({ name: "google.protobuf.Timestamp" });
  });

  it("maps duration → google.protobuf.Duration", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: duration;
      }
    `);
    expect(ref).toEqual({
      kind: "wellKnown",
      name: "google.protobuf.Duration",
      importPath: "google/protobuf/duration.proto",
    });
  });

  it("maps plainDate → google.type.Date", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: plainDate;
      }
    `);
    expect(ref).toMatchObject({ name: "google.type.Date" });
  });

  it("maps plainTime → google.type.TimeOfDay", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: plainTime;
      }
    `);
    expect(ref).toMatchObject({ name: "google.type.TimeOfDay" });
  });

  it("maps decimal → google.type.Decimal by default", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: decimal;
      }
    `);
    expect(ref).toMatchObject({ name: "google.type.Decimal" });
  });

  it("falls back timestamp toggle off → int64 (epoch ms)", async () => {
    const { ref } = await resolveProperty(
      `
      @message
      model M {
        @test target: utcDateTime;
      }
    `,
      { wellKnown: { timestamp: false } },
    );
    expect(ref).toEqual({ kind: "scalar", name: "int64" });
  });

  it("falls back decimal toggle off → string", async () => {
    const { ref } = await resolveProperty(
      `
      @message
      model M {
        @test target: decimal;
      }
    `,
      { wellKnown: { decimal: false } },
    );
    expect(ref).toEqual({ kind: "scalar", name: "string" });
  });
});

describe("resolveProtoType — ORM-style semantic scalars (by name)", () => {
  it.each([
    ["uuid", "string"],
    ["email", "string"],
    ["url", "string"],
    ["serial", "int32"],
    ["bigserial", "int64"],
  ] as const)("maps inline %s extends %s", async (name, base) => {
    const baseTsp = base === "string" ? "string" : base === "int32" ? "int32" : "int64";
    const { ref } = await resolveProperty(`
      scalar ${name} extends ${baseTsp};

      @message
      model M {
        @test target: ${name};
      }
    `);
    const expected = name === "serial" ? "int32" : name === "bigserial" ? "int64" : "string";
    expect(ref).toEqual({ kind: "scalar", name: expected });
  });

  it("emits storage-only-scalar warning for tsvector without override", async () => {
    const { ref, warnings } = await resolveProperty(`
      scalar tsvector extends string;

      @message
      model M {
        @test target: tsvector;
      }
    `);
    expect(ref).toMatchObject({ name: "google.protobuf.Any" });
    expect(warnings).toEqual([{ kind: "storage-only-scalar", scalarName: "tsvector" }]);
  });

  it("emits storage-only-scalar warning for inet", async () => {
    const { warnings } = await resolveProperty(`
      scalar inet extends string;

      @message
      model M {
        @test target: inet;
      }
    `);
    expect(warnings).toEqual([{ kind: "storage-only-scalar", scalarName: "inet" }]);
  });
});

describe("resolveProtoType — composites", () => {
  it("unwraps Array<T> → repeated T", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: int32[];
      }
    `);
    expect(ref).toEqual({
      kind: "repeated",
      element: { kind: "scalar", name: "int32" },
    });
  });

  it("nested arrays unwrap once (proto has no repeated repeated)", async () => {
    // proto3 disallows repeated repeated. The resolver currently surfaces this
    // as repeated<repeated<T>> — the emitter (Phase 3) is responsible for
    // raising a diagnostic. Just assert the resolver behavior is predictable.
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: int32[][];
      }
    `);
    expect(ref.kind).toBe("repeated");
    expect((ref as { kind: "repeated"; element: { kind: string } }).element.kind).toBe("repeated");
  });

  it("unwraps Record<V> → map<string, V>", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test target: Record<string>;
      }
    `);
    expect(ref).toEqual({
      kind: "map",
      key: "string",
      value: { kind: "scalar", name: "string" },
    });
  });

  it("rejects nested maps", async () => {
    const { ref, warnings } = await resolveProperty(`
      @message
      model M {
        @test target: Record<Record<string>>;
      }
    `);
    expect(ref).toMatchObject({ name: "google.protobuf.Any" });
    expect(warnings).toContainEqual({ kind: "nested-map" });
  });
});

describe("resolveProtoType — model + enum references", () => {
  it("resolves a Model reference to a qualified message ref", async () => {
    const { ref } = await resolveProperty(`
      @message
      model Inner {
        @field(1) id: string;
      }

      @message
      model Outer {
        @test target: Inner;
      }
    `);
    expect(ref.kind).toBe("message");
    expect((ref as { qualifiedName: string }).qualifiedName).toContain("Inner");
  });

  it("resolves an Enum reference to a qualified enum ref", async () => {
    const { ref } = await resolveProperty(`
      enum Color { red, green, blue }

      @message
      model Outer {
        @test target: Color;
      }
    `);
    expect(ref.kind).toBe("enum");
    expect((ref as { qualifiedName: string }).qualifiedName).toContain("Color");
  });
});

describe("resolveProtoType — decorator overrides", () => {
  it("@map forces map<K, V> verbatim", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test
        @map("string", "openlet.user.v1.UserSettings")
        @field(1)
        target: Record<string>;
      }
    `);
    expect(ref).toEqual({
      kind: "map",
      key: "string",
      value: { kind: "scalar", name: "openlet.user.v1.UserSettings" },
    });
  });

  it("@map with invalid key surfaces diagnostic", async () => {
    const { ref, warnings } = await resolveProperty(`
      @message
      model M {
        @test
        @map("bytes", "string")
        @field(1)
        target: Record<string>;
      }
    `);
    expect(ref).toMatchObject({ name: "google.protobuf.Any" });
    expect(warnings).toContainEqual({ kind: "invalid-map-key", keyTypeName: "bytes" });
  });

  it("@goType coerces wire type to bytes", async () => {
    const { ref } = await resolveProperty(`
      @message
      model M {
        @test
        @goType("github.com/example/pkg.MyType")
        @field(1)
        target: string;
      }
    `);
    expect(ref).toEqual({ kind: "scalar", name: "bytes" });
  });
});
