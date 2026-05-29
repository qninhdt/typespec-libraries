import { describe, expect, it } from "vitest";
import {
  buildBufYaml,
  buildBufGenYaml,
  isRegenerable,
  BUF_HEADER_MARKER,
} from "../../src/writer/buf-config.js";

describe("buildBufYaml", () => {
  it("emits the header marker + opt-out line", () => {
    const yaml = buildBufYaml();
    expect(yaml).toContain(BUF_HEADER_MARKER);
    expect(yaml).toContain("Remove this line to mark the file hand-managed");
  });

  it("emits version v1, FILE breaking, DEFAULT lint with the openlet excepts", () => {
    const yaml = buildBufYaml();
    expect(yaml).toContain("version: v1");
    expect(yaml).toContain("breaking:");
    expect(yaml).toContain("    - FILE");
    expect(yaml).toContain("    - DEFAULT");
    expect(yaml).toContain("PACKAGE_VERSION_SUFFIX");
    expect(yaml).toContain("RPC_REQUEST_RESPONSE_UNIQUE");
  });

  it("renders empty deps when none provided", () => {
    expect(buildBufYaml()).toContain("deps: []");
  });

  it("renders deps list when provided (sorted)", () => {
    const yaml = buildBufYaml({ deps: ["buf.build/z/x", "buf.build/a/y"] });
    const aIdx = yaml.indexOf("buf.build/a/y");
    const zIdx = yaml.indexOf("buf.build/z/x");
    expect(aIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeLessThan(zIdx);
  });

  it("appends + dedupes + sorts caller lint excepts", () => {
    const yaml = buildBufYaml({ lintExcept: ["CUSTOM_RULE", "PACKAGE_VERSION_SUFFIX"] });
    // CUSTOM_RULE present, PACKAGE_VERSION_SUFFIX not duplicated.
    expect(yaml).toContain("CUSTOM_RULE");
    expect(yaml.match(/PACKAGE_VERSION_SUFFIX/g)).toHaveLength(1);
  });

  it("emits breaking ignore entries when provided", () => {
    const yaml = buildBufYaml({ breakingIgnore: ["openlet/old/v1.proto"] });
    expect(yaml).toContain("  ignore:");
    expect(yaml).toContain("    - openlet/old/v1.proto");
  });

  it("is deterministic across runs", () => {
    expect(buildBufYaml({ lintExcept: ["B", "A"] })).toBe(buildBufYaml({ lintExcept: ["A", "B"] }));
  });
});

describe("buildBufGenYaml", () => {
  it("defaults to go + go-grpc with managed go_package_prefix", () => {
    const yaml = buildBufGenYaml({ goPackagePrefix: "github.com/openlet/x" });
    expect(yaml).toContain("managed:");
    expect(yaml).toContain("    default: github.com/openlet/x");
    expect(yaml).toContain("  - plugin: go");
    expect(yaml).toContain("  - plugin: go-grpc");
    expect(yaml).toContain("paths=source_relative");
    expect(yaml).toContain("require_unimplemented_servers=false");
  });

  it("python plugins omit the managed block", () => {
    const yaml = buildBufGenYaml({ plugins: ["python", "grpc-python"] });
    expect(yaml).not.toContain("managed:");
    expect(yaml).toContain("  - plugin: python");
    expect(yaml).toContain("  - plugin: grpc-python");
    expect(yaml).toContain("out: gen/python");
  });

  it("carries the header marker", () => {
    expect(buildBufGenYaml()).toContain(BUF_HEADER_MARKER);
  });
});

describe("isRegenerable", () => {
  it("returns true for a missing file", () => {
    expect(isRegenerable(undefined)).toBe(true);
  });

  it("returns true when the marker is present", () => {
    expect(isRegenerable(buildBufYaml())).toBe(true);
  });

  it("returns false when the marker was removed", () => {
    expect(isRegenerable("version: v1\nlint:\n  use:\n    - DEFAULT\n")).toBe(false);
  });
});
