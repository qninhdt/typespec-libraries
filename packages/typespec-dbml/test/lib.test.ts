import { describe, expect, it } from "vitest";
import { $lib } from "../src/lib.js";

describe("DBML library definition", () => {
  it("defines emitter options", () => {
    expect($lib.name).toBe("@qninhdt/typespec-dbml");
    expect($lib.emitter?.options).toBeDefined();
  });
});
