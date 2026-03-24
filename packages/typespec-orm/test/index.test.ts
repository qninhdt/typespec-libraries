import { describe, expect, it } from "vitest";
import * as orm from "../src/index.js";
import { $table } from "../src/decorators.js";
import { camelToSnake } from "../src/helpers.js";
import { normalizeOrmGraph } from "../src/normalization.js";

describe("ORM index exports", () => {
  it("re-exports the public entrypoints", () => {
    expect(orm.$lib.name).toBe("@qninhdt/typespec-orm");
    expect(orm.generatedHeader).toContain("@qninhdt/typespec-orm");
    expect(orm.$decorators["Qninhdt.Orm"].table).toBe($table);
    expect(orm.camelToSnake).toBe(camelToSnake);
    expect(orm.normalizeOrmGraph).toBe(normalizeOrmGraph);
    expect(typeof orm.reportDiagnostic).toBe("function");
  });
});
