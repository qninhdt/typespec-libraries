import { describe, expect, it } from "vitest";
import { $lib, reportDiagnostic } from "../src/lib.js";

describe("GORM library definition", () => {
  it("defines diagnostics and emitter options", () => {
    expect($lib.name).toBe("@qninhdt/typespec-gorm");
    expect($lib.diagnostics).toHaveProperty("standalone-requires-library-name");
    expect($lib.diagnostics).toHaveProperty("unknown-format");
    expect($lib.emitter?.options).toBeDefined();
    expect(typeof reportDiagnostic).toBe("function");
  });
});
