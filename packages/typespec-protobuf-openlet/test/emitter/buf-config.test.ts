import type { EmitContext, Program } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { $onEmit, BUF_HEADER_MARKER } from "@qninhdt/typespec-protobuf-openlet";
import type { ProtoEmitterOptions } from "@qninhdt/typespec-protobuf-openlet";
import { createTestRunner } from "../utils.js";

const OUTPUT_DIR = "/output";

interface EmitResult {
  files: Map<string, string>;
  diagnostics: Program["diagnostics"];
}

/** Emit with an optional pre-seeded file set (for marker-protection tests). */
async function emit(
  code: string,
  options: ProtoEmitterOptions = {},
  seedFiles?: Record<string, string>,
): Promise<EmitResult> {
  const runner = await createTestRunner();
  await runner.compile(code);
  const program = runner.program;
  const errors = program.diagnostics.filter((d) => d.severity === "error");
  expect(errors, errors.map((d) => d.message).join("\n")).toHaveLength(0);

  const captured = new Map<string, string>(Object.entries(seedFiles ?? {}));
  const originalWrite = program.host.writeFile;
  const originalRead = program.host.readFile;
  program.host.writeFile = async (path: string, content: string) => {
    captured.set(path, content);
  };

  program.host.readFile = (async (path: string) => {
    if (captured.has(path)) return { text: captured.get(path)!, path } as never;
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

const FIXTURE = `
  @package("openlet.user.v1", #{ goPackage: "github.com/openlet/user/v1" })
  namespace Pkg {
    @message model M { @field(1) id: string; }
  }
`;

describe("$onEmit — buf config generation", () => {
  it("writes buf.yaml + buf.gen.yaml at the output root by default", async () => {
    const { files } = await emit(FIXTURE, {
      "go-package-prefix": "github.com/openlet/user",
    });
    expect(files.has(`${OUTPUT_DIR}/buf.yaml`)).toBe(true);
    expect(files.has(`${OUTPUT_DIR}/buf.gen.yaml`)).toBe(true);
    expect(files.get(`${OUTPUT_DIR}/buf.yaml`)!).toContain("version: v1");
    expect(files.get(`${OUTPUT_DIR}/buf.gen.yaml`)!).toContain("  - plugin: go");
  });

  it("buf.enabled: false skips buf config entirely (leti scenario)", async () => {
    const { files } = await emit(FIXTURE, { buf: { enabled: false } });
    expect(files.has(`${OUTPUT_DIR}/buf.yaml`)).toBe(false);
    expect(files.has(`${OUTPUT_DIR}/buf.gen.yaml`)).toBe(false);
  });

  it("python plugins produce a python-only buf.gen.yaml", async () => {
    const { files } = await emit(FIXTURE, {
      buf: { plugins: ["python", "grpc-python"] },
    });
    const gen = files.get(`${OUTPUT_DIR}/buf.gen.yaml`)!;
    expect(gen).toContain("  - plugin: python");
    expect(gen).not.toContain("managed:");
  });

  it("preserves a hand-customized config (marker removed) and warns", async () => {
    const customized = "version: v1\nlint:\n  use:\n    - DEFAULT\n";
    const { files, diagnostics } = await emit(
      FIXTURE,
      { "go-package-prefix": "github.com/openlet/user" },
      { [`${OUTPUT_DIR}/buf.yaml`]: customized },
    );
    // buf.yaml left untouched.
    expect(files.get(`${OUTPUT_DIR}/buf.yaml`)).toBe(customized);
    const warn = diagnostics.find((d) => d.code.includes("buf-config-customized"));
    expect(warn).toBeDefined();
  });

  it("regenerates a config that still carries the marker", async () => {
    const stale = `${BUF_HEADER_MARKER}\nversion: v1\n# stale content\n`;
    const { files } = await emit(
      FIXTURE,
      { "go-package-prefix": "github.com/openlet/user" },
      { [`${OUTPUT_DIR}/buf.yaml`]: stale },
    );
    // Marker present → regenerated (no longer the stale content).
    expect(files.get(`${OUTPUT_DIR}/buf.yaml`)).not.toContain("# stale content");
    expect(files.get(`${OUTPUT_DIR}/buf.yaml`)).toContain("breaking:");
  });

  it("buf.force overwrites a hand-customized config", async () => {
    const customized = "version: v1\n# hand managed\n";
    const { files } = await emit(
      FIXTURE,
      { buf: { force: true, "go-package-prefix": "github.com/openlet/user" } },
      { [`${OUTPUT_DIR}/buf.yaml`]: customized },
    );
    expect(files.get(`${OUTPUT_DIR}/buf.yaml`)).not.toContain("# hand managed");
    expect(files.get(`${OUTPUT_DIR}/buf.yaml`)).toContain(BUF_HEADER_MARKER);
  });
});
