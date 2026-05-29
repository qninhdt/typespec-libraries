import type {
  Enum,
  Interface,
  Model,
  ModelProperty,
  Namespace,
  Operation,
} from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import {
  isProtoMessage,
  getProtoMessageOverrideName,
  getProtoFieldNumber,
  getProtoReservations,
  getProtoOneof,
  isProtoService,
  getProtoRpcOverrideName,
  isKeepEmptyRequest,
  isProtoIgnored,
  getProtoFieldName,
  getProtoGoType,
  getProtoMap,
  getProtoPackage,
} from "@qninhdt/typespec-protobuf-openlet";
import { createTestRunner } from "./utils.js";

describe("@message", () => {
  it("marks a model as a proto message", async () => {
    const runner = await createTestRunner();
    const { User } = (await runner.compile(`
      @test @message
      model User {
        @field(1) id: string;
      }
    `)) as { User: Model };

    expect(isProtoMessage(runner.program, User)).toBe(true);
    expect(getProtoMessageOverrideName(runner.program, User)).toBeUndefined();
  });

  it("stores an explicit override name", async () => {
    const runner = await createTestRunner();
    const { User } = (await runner.compile(`
      @test @message("UserV2")
      model User {
        @field(1) id: string;
      }
    `)) as { User: Model };

    expect(isProtoMessage(runner.program, User)).toBe(true);
    expect(getProtoMessageOverrideName(runner.program, User)).toBe("UserV2");
  });
});

describe("@field", () => {
  it("pins a property's proto field number", async () => {
    const runner = await createTestRunner();
    const { id, displayName } = (await runner.compile(`
      @message
      model User {
        @test @field(1) id: string;
        @test @field(7) displayName: string;
      }
    `)) as { id: ModelProperty; displayName: ModelProperty };

    expect(getProtoFieldNumber(runner.program, id)).toBe(1);
    expect(getProtoFieldNumber(runner.program, displayName)).toBe(7);
  });
});

describe("@reserve", () => {
  it("stores a single index reservation on a model", async () => {
    const runner = await createTestRunner();
    const { User } = (await runner.compile(`
      @test @message
      @reserve(100)
      model User {
        @field(1) id: string;
      }
    `)) as { User: Model };

    expect(getProtoReservations(runner.program, User)).toEqual([{ kind: "index", value: 100 }]);
  });

  it("stores a range reservation", async () => {
    const runner = await createTestRunner();
    const { User } = (await runner.compile(`
      @test @message
      @reserve(#[100, 199])
      model User {
        @field(1) id: string;
      }
    `)) as { User: Model };

    expect(getProtoReservations(runner.program, User)).toEqual([
      { kind: "range", start: 100, end: 199 },
    ]);
  });

  it("stores a name reservation", async () => {
    const runner = await createTestRunner();
    const { User } = (await runner.compile(`
      @test @message
      @reserve("legacyId")
      model User {
        @field(1) id: string;
      }
    `)) as { User: Model };

    expect(getProtoReservations(runner.program, User)).toEqual([
      { kind: "name", value: "legacyId" },
    ]);
  });

  it("mixes indexes, ranges, and names in a single call", async () => {
    const runner = await createTestRunner();
    const { User } = (await runner.compile(`
      @test @message
      @reserve(#[8, 15], 100, "legacyId")
      model User {
        @field(1) id: string;
      }
    `)) as { User: Model };

    expect(getProtoReservations(runner.program, User)).toEqual([
      { kind: "range", start: 8, end: 15 },
      { kind: "index", value: 100 },
      { kind: "name", value: "legacyId" },
    ]);
  });

  it("works on enums (parity gap with upstream)", async () => {
    const runner = await createTestRunner();
    const { QuotaKind } = (await runner.compile(`
      @test
      @reserve(#[100, 199])
      enum QuotaKind {
        unspecified,
        storage,
        bandwidth,
      }
    `)) as { QuotaKind: Enum };

    expect(getProtoReservations(runner.program, QuotaKind)).toEqual([
      { kind: "range", start: 100, end: 199 },
    ]);
  });

  it("accumulates across multiple @reserve calls", async () => {
    const runner = await createTestRunner();
    const { User } = (await runner.compile(`
      @test @message
      @reserve(100)
      @reserve("legacyId")
      model User {
        @field(1) id: string;
      }
    `)) as { User: Model };

    expect(getProtoReservations(runner.program, User)).toEqual([
      { kind: "name", value: "legacyId" },
      { kind: "index", value: 100 },
    ]);
  });
});

describe("@oneof", () => {
  it("groups properties by oneof name", async () => {
    const runner = await createTestRunner();
    const { textBody, bytesBody } = (await runner.compile(`
      @message
      model Payload {
        @test @oneof("body") @field(1) textBody: string;
        @test @oneof("body") @field(2) bytesBody: bytes;
      }
    `)) as { textBody: ModelProperty; bytesBody: ModelProperty };

    expect(getProtoOneof(runner.program, textBody)).toBe("body");
    expect(getProtoOneof(runner.program, bytesBody)).toBe("body");
  });
});

describe("@service / @rpc / @keepEmptyRequest", () => {
  it("marks an interface as a service", async () => {
    const runner = await createTestRunner();
    const { UserService } = (await runner.compile(`
      @message model GetUserRequest { @field(1) id: string; }
      @message model GetUserResponse { @field(1) id: string; }

      @test @Openlet.Proto.service
      interface UserService {
        getUser(...GetUserRequest): GetUserResponse;
      }
    `)) as { UserService: Interface };

    expect(isProtoService(runner.program, UserService)).toBe(true);
  });

  it("stores an explicit RPC name override", async () => {
    const runner = await createTestRunner();
    const { getUser } = (await runner.compile(`
      @message model GetUserRequest { @field(1) id: string; }
      @message model GetUserResponse { @field(1) id: string; }

      @Openlet.Proto.service
      interface UserService {
        @test @rpc("FetchUser")
        getUser(...GetUserRequest): GetUserResponse;
      }
    `)) as { getUser: Operation };

    expect(getProtoRpcOverrideName(runner.program, getUser)).toBe("FetchUser");
  });

  it("falls back to undefined when @rpc has no override", async () => {
    const runner = await createTestRunner();
    const { getUser } = (await runner.compile(`
      @message model GetUserRequest { @field(1) id: string; }
      @message model GetUserResponse { @field(1) id: string; }

      @Openlet.Proto.service
      interface UserService {
        @test @rpc
        getUser(...GetUserRequest): GetUserResponse;
      }
    `)) as { getUser: Operation };

    expect(getProtoRpcOverrideName(runner.program, getUser)).toBeUndefined();
  });

  it("flags an operation as @keepEmptyRequest", async () => {
    const runner = await createTestRunner();
    const { ping } = (await runner.compile(`
      @message model Empty {}
      @message model Pong { @field(1) ts: int64; }

      @Openlet.Proto.service
      interface HealthService {
        @test @keepEmptyRequest
        ping(...Empty): Pong;
      }
    `)) as { ping: Operation };

    expect(isKeepEmptyRequest(runner.program, ping)).toBe(true);
  });
});

describe("@package", () => {
  it("stores a name-only spec on the namespace", async () => {
    const runner = await createTestRunner();
    const { Pkg } = (await runner.compile(`
      @test @package("openlet.user.v1")
      namespace Pkg {
        @message model User { @field(1) id: string; }
      }
    `)) as { Pkg: Namespace };

    const spec = getProtoPackage(runner.program, Pkg);
    expect(spec).toBeDefined();
    expect(spec?.name).toBe("openlet.user.v1");
    expect(spec?.details).toEqual({});
  });

  it("stores per-language options", async () => {
    const runner = await createTestRunner();
    const { Pkg } = (await runner.compile(`
      @test @package(
        "openlet.user.v1",
        #{
          goPackage: "github.com/openlet/user-service/proto/gen/go/openlet/user/v1",
          javaPackage: "io.openlet.user.v1",
          javaMultipleFiles: true,
        }
      )
      namespace Pkg {
        @message model User { @field(1) id: string; }
      }
    `)) as { Pkg: Namespace };

    const spec = getProtoPackage(runner.program, Pkg);
    expect(spec?.name).toBe("openlet.user.v1");
    expect(spec?.details.goPackage).toBe(
      "github.com/openlet/user-service/proto/gen/go/openlet/user/v1",
    );
    expect(spec?.details.javaPackage).toBe("io.openlet.user.v1");
    expect(spec?.details.javaMultipleFiles).toBe(true);
  });
});

describe("@ignore", () => {
  it("flags a property as proto-suppressed", async () => {
    const runner = await createTestRunner();
    const { secretHash } = (await runner.compile(`
      @message
      model User {
        @field(1) id: string;
        @test @ignore secretHash: string;
      }
    `)) as { secretHash: ModelProperty };

    expect(isProtoIgnored(runner.program, secretHash)).toBe(true);
  });
});

describe("@rename", () => {
  it("stores an explicit field name override", async () => {
    const runner = await createTestRunner();
    const { oauth2IDToken } = (await runner.compile(`
      @message
      model User {
        @test @rename("oauth2_id_token") @field(1) oauth2IDToken: string;
      }
    `)) as { oauth2IDToken: ModelProperty };

    expect(getProtoFieldName(runner.program, oauth2IDToken)).toBe("oauth2_id_token");
  });
});

describe("@goType", () => {
  it("parses an import path + type name", async () => {
    const runner = await createTestRunner();
    const { metadata } = (await runner.compile(`
      @message
      model File {
        @field(1) id: string;
        @test @goType("github.com/openlet/file-service/internal/file.Metadata")
        @field(2) metadata: bytes;
      }
    `)) as { metadata: ModelProperty };

    const spec = getProtoGoType(runner.program, metadata);
    expect(spec).toBeDefined();
    expect(spec?.importPath).toBe("github.com/openlet/file-service/internal/file");
    expect(spec?.typeName).toBe("Metadata");
    expect(spec?.raw).toBe("github.com/openlet/file-service/internal/file.Metadata");
  });

  it("splits at the LAST dot so dotted package paths still parse", async () => {
    const runner = await createTestRunner();
    const { metadata } = (await runner.compile(`
      @message
      model File {
        @field(1) id: string;
        @test @goType("github.com/foo/bar/v2.MyType") @field(2) metadata: bytes;
      }
    `)) as { metadata: ModelProperty };

    const spec = getProtoGoType(runner.program, metadata);
    expect(spec?.importPath).toBe("github.com/foo/bar/v2");
    expect(spec?.typeName).toBe("MyType");
  });

  it("preserves the raw value when no usable dot is present", async () => {
    const runner = await createTestRunner();
    const { metadata } = (await runner.compile(`
      @message
      model File {
        @field(1) id: string;
        @test @goType("invalid") @field(2) metadata: bytes;
      }
    `)) as { metadata: ModelProperty };

    const spec = getProtoGoType(runner.program, metadata);
    expect(spec).toBeDefined();
    expect(spec?.importPath).toBe("");
    expect(spec?.typeName).toBe("");
    expect(spec?.raw).toBe("invalid");
  });
});

describe("@map", () => {
  it("stores key + value type names verbatim", async () => {
    const runner = await createTestRunner();
    const { bag } = (await runner.compile(`
      @message
      model Settings {
        @field(1) id: string;
        @test @map("string", "openlet.user.v1.UserSettings") @field(2) bag: Record<string>;
      }
    `)) as { bag: ModelProperty };

    const spec = getProtoMap(runner.program, bag);
    expect(spec).toEqual({
      key: "string",
      value: "openlet.user.v1.UserSettings",
    });
  });
});

describe("decorator surface integrity", () => {
  it("returns undefined / false for properties with no decorators applied", async () => {
    const runner = await createTestRunner();
    const { id } = (await runner.compile(`
      @message
      model User {
        @test id: string;
      }
    `)) as { id: ModelProperty };

    expect(getProtoFieldNumber(runner.program, id)).toBeUndefined();
    expect(getProtoFieldName(runner.program, id)).toBeUndefined();
    expect(getProtoOneof(runner.program, id)).toBeUndefined();
    expect(getProtoGoType(runner.program, id)).toBeUndefined();
    expect(getProtoMap(runner.program, id)).toBeUndefined();
    expect(isProtoIgnored(runner.program, id)).toBe(false);
  });
});
