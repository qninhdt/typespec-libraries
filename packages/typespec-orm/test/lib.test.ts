import { describe, expect, it } from "vitest";
import { $lib as ormLib } from "../src/lib.js";

describe("ORM library definition", () => {
  it("registers key diagnostics", () => {
    expect(ormLib.name).toBe("@qninhdt/typespec-orm");
    expect(ormLib.diagnostics).toHaveProperty("multiple-keys");
    expect(ormLib.diagnostics).toHaveProperty("unsupported-relation-shape");
  });

  it("exposes emitter option schema metadata", () => {
    expect(ormLib.emitter).toBeUndefined();
  });
});
