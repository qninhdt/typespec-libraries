import type { EmitContext, Program } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { $onEmit } from "@qninhdt/typespec-protobuf-openlet";
import type { ProtoEmitterOptions } from "@qninhdt/typespec-protobuf-openlet";
import { createTestRunner } from "../utils.js";

const OUTPUT_DIR = "/output";

interface EmitResult {
  files: Map<string, string>;
  program: Program;
}

async function emit(code: string, options: ProtoEmitterOptions = {}): Promise<EmitResult> {
  const runner = await createTestRunner();
  await runner.compile(code);
  const program = runner.program;
  const errors = program.diagnostics.filter((d) => d.severity === "error");
  expect(errors, `compile errors: ${errors.map((d) => d.message).join("\n")}`).toHaveLength(0);

  const captured = new Map<string, string>();
  const originalWriteFile = program.host.writeFile;
  program.host.writeFile = async (path: string, content: string) => {
    captured.set(path, content);
  };

  const ctx: EmitContext<ProtoEmitterOptions> = {
    program,
    emitterOutputDir: OUTPUT_DIR,
    options,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  await $onEmit(ctx);

  program.host.writeFile = originalWriteFile;
  return { files: captured, program };
}

describe("$onEmit — single file", () => {
  it("emits one .proto per @package namespace", async () => {
    const { files } = await emit(`
      @package("openlet.user.v1")
      namespace Pkg {
        @message
        model GetUserRequest {
          @field(1) userId: string;
        }
      }
    `);

    const path = `${OUTPUT_DIR}/openlet/user/v1.proto`;
    expect(files.has(path)).toBe(true);
    const content = files.get(path)!;
    expect(content).toContain(`syntax = "proto3";`);
    expect(content).toContain("package openlet.user.v1;");
    expect(content).toContain("message GetUserRequest {");
    expect(content).toContain("string user_id = 1;");
  });

  it("auto snake_cases camelCase property names", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @message
        model X {
          @field(1) userId: string;
          @field(2) IPv4Address: string;
          @field(3) OAuth2Token: string;
        }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    expect(content).toContain("string user_id = 1;");
    expect(content).toContain("string ipv4_address = 2;");
    expect(content).toContain("string oauth2_token = 3;");
  });

  it("emits go_package option", async () => {
    const { files } = await emit(`
      @package("openlet.user.v1", #{ goPackage: "github.com/openlet/user/v1" })
      namespace Pkg {
        @message model M { @field(1) id: string; }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/user/v1.proto`)!;
    expect(content).toContain(`option go_package = "github.com/openlet/user/v1";`);
  });

  it("emits proto3 optional for nullable scalars", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @message
        model M {
          @field(1) id: string;
          @field(2) display?: string;
        }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    expect(content).toContain("string id = 1;");
    expect(content).toContain("optional string display = 2;");
  });

  it("emits reserved ranges and names on messages", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @message
        @reserve(#[100, 199], 50, "legacy")
        model M {
          @field(1) id: string;
        }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    expect(content).toContain("reserved 100 to 199;");
    expect(content).toContain("reserved 50;");
    expect(content).toContain(`reserved "legacy";`);
  });

  it("emits reserved on enums (parity gap with upstream)", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @reserve(#[100, 199])
        enum QuotaKind { unspecified, storage, bandwidth }

        @message model M { @field(1) id: string; }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    expect(content).toContain("enum QuotaKind {");
    expect(content).toContain("reserved 100 to 199;");
    expect(content).toContain("UNSPECIFIED = 0;");
  });

  it("rewrites empty request to google.protobuf.Empty", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @message model Pong { @field(1) ts: int64; }

        @Openlet.Proto.service
        interface HealthService {
          ping(): Pong;
        }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    expect(content).toContain(`import "google/protobuf/empty.proto";`);
    expect(content).toContain("rpc ping(google.protobuf.Empty) returns (Test.Pkg.Pong);");
  });

  it("preserves named empty request when @keepEmptyRequest is set", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @message model HealthCheckRequest {}
        @message model Pong { @field(1) ts: int64; }

        @Openlet.Proto.service
        interface HealthService {
          @keepEmptyRequest
          ping(...HealthCheckRequest): Pong;
        }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    expect(content).toContain("rpc ping(Test.Pkg.HealthCheckRequest) returns (Test.Pkg.Pong);");
  });

  it("emits message imports for well-known types", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @message
        model M {
          @field(1) id: string;
          @field(2) createdAt: utcDateTime;
          @field(3) ttl: duration;
        }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    expect(content).toContain(`import "google/protobuf/duration.proto";`);
    expect(content).toContain(`import "google/protobuf/timestamp.proto";`);
    expect(content).toContain("google.protobuf.Timestamp created_at = 2;");
    expect(content).toContain("google.protobuf.Duration ttl = 3;");
  });

  it("preserves declaration order (no alphabetization — Red Team A4)", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @message model Zebra { @field(1) z: string; }
        @message model Alpha { @field(1) a: string; }
        @message model Mid   { @field(1) m: string; }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    const zebraIdx = content.indexOf("message Zebra");
    const alphaIdx = content.indexOf("message Alpha");
    const midIdx = content.indexOf("message Mid");
    expect(zebraIdx).toBeLessThan(alphaIdx);
    expect(alphaIdx).toBeLessThan(midIdx);
  });

  it("dedupes and sorts imports", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @message
        model M {
          @field(1) a: utcDateTime;
          @field(2) b: utcDateTime;
          @field(3) c: duration;
        }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    const importLines = content
      .split("\n")
      .filter((l) => l.startsWith("import "))
      .map((l) => l.trim());
    expect(importLines).toEqual([
      `import "google/protobuf/duration.proto";`,
      `import "google/protobuf/timestamp.proto";`,
    ]);
  });

  it("emits emitter format-version comment (Red Team R4)", async () => {
    const { files } = await emit(`
      @package("openlet.test.v1")
      namespace Pkg {
        @message model M { @field(1) id: string; }
      }
    `);
    const content = files.get(`${OUTPUT_DIR}/openlet/test/v1.proto`)!;
    expect(content).toContain("// emitter: @qninhdt/typespec-protobuf-openlet@");
  });
});
