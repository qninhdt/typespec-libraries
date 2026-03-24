import { describe, expect, it } from "vitest";
import { $lib, reportDiagnostic } from "../src/lib.js";

describe("Zod library definition", () => {
  it("defines the library name and diagnostics", () => {
    expect($lib.name).toBe("@qninhdt/typespec-zod");
    expect($lib.diagnostics).toHaveProperty("standalone-requires-library-name");
    expect(typeof reportDiagnostic).toBe("function");
  });

  it("defines emitter options", () => {
    expect($lib.emitter).toBeDefined();
    expect($lib.emitter?.options).toBeDefined();
  });
});
