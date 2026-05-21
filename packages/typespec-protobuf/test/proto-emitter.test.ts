import { describe, it, expect } from "vitest";
import { emitSingleProto } from "./utils.js";

describe("protobuf type mapping", () => {
  it("maps basic scalar types", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model User {
        name: string;
        age: int32;
        active: boolean;
        score: float64;
        data: bytes;
      }
    `);

    expect(output).toContain('syntax = "proto3"');
    expect(output).toContain("package test.v1");
    expect(output).toContain("message User");
    expect(output).toContain("string name = 1;");
    expect(output).toContain("int32 age = 2;");
    expect(output).toContain("bool active = 3;");
    expect(output).toContain("double score = 4;");
    expect(output).toContain("bytes data = 5;");
  });

  it("maps integer variants", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model Numbers {
        a: int64;
        b: uint32;
        c: uint64;
        d: float32;
      }
    `);

    expect(output).toContain("int64 a = 1;");
    expect(output).toContain("uint32 b = 2;");
    expect(output).toContain("uint64 c = 3;");
    expect(output).toContain("float d = 4;");
  });

  it("maps well-known types with imports", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;
      using Qninhdt.Orm;

      @protoPackage("test.v1")
      namespace Test;

      model Event {
        createdAt: utcDateTime;
        duration: duration;
      }
    `);

    expect(output).toContain('import "google/protobuf/timestamp.proto"');
    expect(output).toContain('import "google/protobuf/duration.proto"');
    expect(output).toContain("google.protobuf.Timestamp created_at = 1;");
    expect(output).toContain("google.protobuf.Duration duration = 2;");
  });

  it("maps repeated fields from arrays", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model Tags {
        values: string[];
      }
    `);

    expect(output).toContain("repeated string values = 1;");
  });

  it("maps optional fields", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model Profile {
        bio?: string;
      }
    `);

    expect(output).toContain("optional string bio = 1;");
  });

  it("maps model references as message types", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model Address {
        street: string;
      }

      model User {
        address: Address;
      }
    `);

    expect(output).toContain("message Address");
    expect(output).toContain("message User");
    expect(output).toContain("Address address = 1;");
  });
});

describe("protobuf field numbering", () => {
  it("auto-numbers fields sequentially", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model Item {
        a: string;
        b: string;
        c: string;
      }
    `);

    expect(output).toContain("string a = 1;");
    expect(output).toContain("string b = 2;");
    expect(output).toContain("string c = 3;");
  });

  it("respects @protoField explicit numbers", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model Item {
        a: string;
        @protoField(10)
        b: string;
        c: string;
      }
    `);

    expect(output).toContain("string a = 1;");
    expect(output).toContain("string b = 10;");
    expect(output).toContain("string c = 11;");
  });
});

describe("protobuf enums", () => {
  it("generates enum with string values as sequential numbers", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      enum Status {
        Active,
        Inactive,
        Deleted,
      }

      model Item {
        status: Status;
      }
    `);

    expect(output).toContain("enum Status {");
    expect(output).toContain("ACTIVE = 0;");
    expect(output).toContain("INACTIVE = 1;");
    expect(output).toContain("DELETED = 2;");
  });

  it("prepends UNSPECIFIED when no zero value exists", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      enum Priority {
        Low: 1,
        Medium: 2,
        High: 3,
      }

      model Task {
        priority: Priority;
      }
    `);

    expect(output).toContain("PRIORITY_UNSPECIFIED = 0;");
    expect(output).toContain("LOW = 1;");
    expect(output).toContain("MEDIUM = 2;");
    expect(output).toContain("HIGH = 3;");
  });
});

describe("protobuf services", () => {
  it("generates service with rpc methods", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model GetUserRequest {
        id: string;
      }

      model GetUserResponse {
        name: string;
      }

      @protoService
      interface UserService {
        getUser(request: GetUserRequest): GetUserResponse;
      }
    `);

    expect(output).toContain("service UserService {");
    expect(output).toContain("rpc GetUser(GetUserRequest) returns (GetUserResponse);");
  });

  it("generates void return as google.protobuf.Empty", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model DeleteRequest {
        id: string;
      }

      @protoService
      interface ItemService {
        deleteItem(request: DeleteRequest): void;
      }
    `);

    expect(output).toContain('import "google/protobuf/empty.proto"');
    expect(output).toContain("rpc DeleteItem(DeleteRequest) returns (google.protobuf.Empty);");
  });

  it("generates streaming rpcs", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      model ChatMessage {
        text: string;
      }

      @protoService
      interface ChatService {
        @stream(StreamMode.Out)
        subscribe(request: ChatMessage): ChatMessage;

        @stream(StreamMode.In)
        upload(request: ChatMessage): ChatMessage;

        @stream(StreamMode.Duplex)
        chat(request: ChatMessage): ChatMessage;
      }
    `);

    expect(output).toContain("rpc Subscribe(ChatMessage) returns (stream ChatMessage);");
    expect(output).toContain("rpc Upload(stream ChatMessage) returns (ChatMessage);");
    expect(output).toContain("rpc Chat(stream ChatMessage) returns (stream ChatMessage);");
  });
});

describe("protobuf @protoMap", () => {
  it("suppresses model emission for mapped types", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;

      @protoPackage("test.v1")
      namespace Test;

      @protoMap("google.protobuf.Struct")
      model Metadata {
        key: string;
        value: string;
      }

      model Item {
        name: string;
      }
    `);

    expect(output).not.toContain("message Metadata");
    expect(output).toContain("message Item");
  });
});

describe("protobuf skips @table models", () => {
  it("does not emit table models as messages", async () => {
    const output = await emitSingleProto(`
      using Qninhdt.Proto;
      using Qninhdt.Orm;

      @protoPackage("test.v1")
      namespace Test;

      @table
      model User {
        @key id: uuid;
        name: string;
      }

      model CreateUserRequest {
        name: string;
      }
    `);

    expect(output).not.toContain("message User");
    expect(output).toContain("message CreateUserRequest");
  });
});
