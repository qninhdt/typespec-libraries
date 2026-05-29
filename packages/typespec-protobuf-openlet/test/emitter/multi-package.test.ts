import type { EmitContext, Program } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { $onEmit } from "@qninhdt/typespec-protobuf-openlet";
import type { ProtoEmitterOptions } from "@qninhdt/typespec-protobuf-openlet";
import { createTestRunner } from "../utils.js";

const OUTPUT_DIR = "/output";

interface EmitResult {
  files: Map<string, string>;
  diagnostics: Program["diagnostics"];
}

/** Compile + emit WITHOUT asserting zero diagnostics (some tests want them). */
async function emitRaw(code: string, options: ProtoEmitterOptions = {}): Promise<EmitResult> {
  const runner = await createTestRunner();
  await runner.compile(code);
  const program = runner.program;

  const captured = new Map<string, string>();
  const original = program.host.writeFile;
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
  program.host.writeFile = original;
  return { files: captured, diagnostics: program.diagnostics };
}

/** Two-package fixture: events (source) + file (consumer of events). */
const TWO_PACKAGE = `
  @package("openlet.events.v1")
  namespace Events {
    @message
    model FileProcessed {
      @field(1) fileId: string;
    }
  }

  @package("openlet.file.v1")
  namespace File {
    @message
    model FileInfo {
      @field(1) id: string;
      @field(2) lastEvent: Events.FileProcessed;
    }
  }
`;

describe("$onEmit — multi-package", () => {
  it("emits one .proto per @package namespace", async () => {
    const { files } = await emitRaw(TWO_PACKAGE);
    expect(files.has(`${OUTPUT_DIR}/openlet/events/v1.proto`)).toBe(true);
    expect(files.has(`${OUTPUT_DIR}/openlet/file/v1.proto`)).toBe(true);
  });

  it("same-package refs stay bare; cross-package refs qualify + import", async () => {
    const { files } = await emitRaw(TWO_PACKAGE);
    const fileProto = files.get(`${OUTPUT_DIR}/openlet/file/v1.proto`)!;

    // Cross-package reference qualifies to proto-package form.
    expect(fileProto).toContain("openlet.events.v1.FileProcessed last_event = 2;");
    // And records the import.
    expect(fileProto).toContain(`import "openlet/events/v1.proto";`);

    // The events file references its own type bare (no import to itself).
    const eventsProto = files.get(`${OUTPUT_DIR}/openlet/events/v1.proto`)!;
    expect(eventsProto).not.toContain("import");
  });

  it("emit-only restricts which files are written but keeps imports resolvable", async () => {
    const { files } = await emitRaw(TWO_PACKAGE, {
      "emit-only": ["openlet.file.v1"],
    });
    // Only the file package is written.
    expect(files.has(`${OUTPUT_DIR}/openlet/file/v1.proto`)).toBe(true);
    expect(files.has(`${OUTPUT_DIR}/openlet/events/v1.proto`)).toBe(false);

    // Cross-package ref still resolves to the qualified name + import.
    const fileProto = files.get(`${OUTPUT_DIR}/openlet/file/v1.proto`)!;
    expect(fileProto).toContain("openlet.events.v1.FileProcessed last_event = 2;");
    expect(fileProto).toContain(`import "openlet/events/v1.proto";`);
  });

  it("emit-imports: false inlines bare names without import statements", async () => {
    const { files } = await emitRaw(TWO_PACKAGE, { "emit-imports": false });
    const fileProto = files.get(`${OUTPUT_DIR}/openlet/file/v1.proto`)!;
    // No import lines emitted.
    expect(fileProto).not.toContain("import");
  });

  it("flat import-path-style emits basename only", async () => {
    const { files } = await emitRaw(TWO_PACKAGE, {
      "import-path-style": "flat",
    });
    const fileProto = files.get(`${OUTPUT_DIR}/openlet/file/v1.proto`)!;
    expect(fileProto).toContain(`import "v1.proto";`);
  });

  it("output-paths overrides the emitted file path + import path", async () => {
    const { files } = await emitRaw(TWO_PACKAGE, {
      "output-paths": {
        "openlet.events.v1": "openlet/events/v1/events.proto",
      },
    });
    expect(files.has(`${OUTPUT_DIR}/openlet/events/v1/events.proto`)).toBe(true);
    const fileProto = files.get(`${OUTPUT_DIR}/openlet/file/v1.proto`)!;
    expect(fileProto).toContain(`import "openlet/events/v1/events.proto";`);
  });

  it("detects cyclic package imports and aborts emit", async () => {
    const { files, diagnostics } = await emitRaw(`
      @package("openlet.a.v1")
      namespace A {
        @message model AMsg {
          @field(1) id: string;
          @field(2) b: B.BMsg;
        }
      }

      @package("openlet.b.v1")
      namespace B {
        @message model BMsg {
          @field(1) id: string;
          @field(2) a: A.AMsg;
        }
      }
    `);
    const cyclic = diagnostics.find((d) => d.code.includes("cyclic-import"));
    expect(cyclic).toBeDefined();
    // Emit aborts — no files written.
    expect(files.size).toBe(0);
  });
});
