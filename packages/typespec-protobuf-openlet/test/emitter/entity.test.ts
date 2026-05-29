import type { EmitContext, Program } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { $onEmit } from "@qninhdt/typespec-protobuf-openlet";
import type { ProtoEmitterOptions } from "@qninhdt/typespec-protobuf-openlet";
import { createEntityTestRunner } from "../utils.js";

const OUTPUT_DIR = "/output";
const ALLOC_PATH = `${OUTPUT_DIR}/.proto-field-allocations.json`;

interface EmitResult {
  files: Map<string, string>;
  diagnostics: Program["diagnostics"];
}

/**
 * Compile + emit an @entity fixture. `seedAllocation` (when given) is written
 * to the allocation path BEFORE emit so stability / drift tests can supply a
 * committed baseline.
 */
async function emitEntities(
  code: string,
  options: ProtoEmitterOptions = {},
  seedAllocation?: Record<string, Record<string, number | number[]>>,
): Promise<EmitResult> {
  const runner = await createEntityTestRunner();
  await runner.compile(code);
  const program = runner.program;

  const errors = program.diagnostics.filter((d) => d.severity === "error");
  expect(errors, `compile errors: ${errors.map((d) => d.message).join("\n")}`).toHaveLength(0);

  const captured = new Map<string, string>();
  if (seedAllocation) {
    captured.set(ALLOC_PATH, JSON.stringify(seedAllocation, null, 2));
  }

  const originalWrite = program.host.writeFile;
  const originalRead = program.host.readFile;
  program.host.writeFile = async (path: string, content: string) => {
    captured.set(path, content);
  };

  program.host.readFile = (async (path: string) => {
    if (captured.has(path)) {
      return { text: captured.get(path)!, path } as never;
    }
    return originalRead(path);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  const ctx: EmitContext<ProtoEmitterOptions> = {
    program,
    emitterOutputDir: OUTPUT_DIR,
    options,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  await $onEmit(ctx);
  program.host.writeFile = originalWrite;
  program.host.readFile = originalRead;
  return { files: captured, diagnostics: program.diagnostics };
}

const SIMPLE_ENTITY = `
  @package("openlet.user.v1")
  namespace Pkg {
    @entity
    model UserProfile {
      @key userId: uuid;
      displayName?: text;
      avatarUrl?: text;
    }
  }
`;

describe("$onEmit — @entity", () => {
  it("emits an entity as a proto message with allocated field numbers", async () => {
    const { files } = await emitEntities(SIMPLE_ENTITY);
    const proto = files.get(`${OUTPUT_DIR}/openlet/user/v1.proto`)!;
    expect(proto).toContain("message UserProfile {");
    expect(proto).toContain("string user_id = 1;");
    expect(proto).toContain("optional string display_name = 2;");
    expect(proto).toContain("optional string avatar_url = 3;");
  });

  it("writes the allocation file", async () => {
    const { files } = await emitEntities(SIMPLE_ENTITY);
    expect(files.has(ALLOC_PATH)).toBe(true);
    const alloc = JSON.parse(files.get(ALLOC_PATH)!);
    expect(alloc["openlet.user.v1.UserProfile"]).toEqual({
      user_id: 1,
      display_name: 2,
      avatar_url: 3,
    });
  });

  it("keeps stored numbers stable when a new field is added", async () => {
    const { files } = await emitEntities(
      `
        @package("openlet.user.v1")
        namespace Pkg {
          @entity
          model UserProfile {
            @key userId: uuid;
            displayName?: text;
            avatarUrl?: text;
            locale?: text;
          }
        }
      `,
      {},
      {
        "openlet.user.v1.UserProfile": {
          user_id: 1,
          display_name: 2,
          avatar_url: 3,
        },
      },
    );
    const proto = files.get(`${OUTPUT_DIR}/openlet/user/v1.proto`)!;
    // Existing fields keep their numbers; the new field gets 4.
    expect(proto).toContain("string user_id = 1;");
    expect(proto).toContain("optional string locale = 4;");
  });

  it("reserves a deleted field's number (Red Team S3)", async () => {
    const { files } = await emitEntities(
      `
        @package("openlet.user.v1")
        namespace Pkg {
          @entity
          model UserProfile {
            @key userId: uuid;
            avatarUrl?: text;
          }
        }
      `,
      {},
      {
        "openlet.user.v1.UserProfile": {
          user_id: 1,
          display_name: 2,
          avatar_url: 3,
        },
      },
    );
    const proto = files.get(`${OUTPUT_DIR}/openlet/user/v1.proto`)!;
    // display_name dropped → its number 2 is reserved.
    expect(proto).toContain("reserved 2;");
    const alloc = JSON.parse(files.get(ALLOC_PATH)!);
    expect(alloc["openlet.user.v1.UserProfile"]._reserved).toContain(2);
  });

  it("proto-side @ignore drops a field AND reserves its number", async () => {
    const { files } = await emitEntities(`
      @package("openlet.user.v1")
      namespace Pkg {
        @entity
        model UserProfile {
          @key userId: uuid;
          displayName?: text;
          @Openlet.Proto.ignore secretHash?: text;
        }
      }
    `);
    const proto = files.get(`${OUTPUT_DIR}/openlet/user/v1.proto`)!;
    expect(proto).toContain("string user_id = 1;");
    expect(proto).toContain("optional string display_name = 2;");
    // secretHash is suppressed from proto emit.
    expect(proto).not.toContain("secret_hash");
  });

  it("emits drift error in allocation-check mode when the file is stale", async () => {
    const { files, diagnostics } = await emitEntities(
      `
        @package("openlet.user.v1")
        namespace Pkg {
          @entity
          model UserProfile {
            @key userId: uuid;
            displayName?: text;
            newField?: text;
          }
        }
      `,
      { "allocation-check": true },
      {
        "openlet.user.v1.UserProfile": {
          user_id: 1,
          display_name: 2,
        },
      },
    );
    const drift = diagnostics.find((d) => d.code.includes("proto-field-allocation-drift"));
    expect(drift).toBeDefined();
    // Emit aborts — no .proto written.
    expect(files.has(`${OUTPUT_DIR}/openlet/user/v1.proto`)).toBe(false);
  });

  it("auto-includes mixin columns (validation V2)", async () => {
    const { files } = await emitEntities(`
      @package("openlet.user.v1")
      namespace Pkg {
        model Timestamps {
          createdAt: utcDateTime;
          updatedAt: utcDateTime;
        }

        @entity
        model UserProfile {
          @key userId: uuid;
          ...Timestamps;
        }
      }
    `);
    const proto = files.get(`${OUTPUT_DIR}/openlet/user/v1.proto`)!;
    expect(proto).toContain("string user_id = 1;");
    // Mixin columns propagate into the proto message.
    expect(proto).toContain("google.protobuf.Timestamp created_at = 2;");
    expect(proto).toContain("google.protobuf.Timestamp updated_at = 3;");
  });

  it("entity coexists with a standalone @message in the same package", async () => {
    const { files } = await emitEntities(`
      @package("openlet.user.v1")
      namespace Pkg {
        @entity
        model UserProfile {
          @key userId: uuid;
        }

        @message
        model GetUserRequest {
          @field(1) userId: string;
        }
      }
    `);
    const proto = files.get(`${OUTPUT_DIR}/openlet/user/v1.proto`)!;
    expect(proto).toContain("message UserProfile {");
    expect(proto).toContain("message GetUserRequest {");
  });
});
