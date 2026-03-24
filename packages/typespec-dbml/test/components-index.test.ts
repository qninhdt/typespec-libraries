import { describe, expect, it } from "vitest";
import * as components from "../src/components/index.js";
import { getDbmlType, formatColumnSettings } from "../src/components/DbmlConstants.js";
import { DbmlTable } from "../src/components/DbmlTable.jsx";
import { generateEnumDefinition } from "../src/components/DbmlEnum.jsx";

describe("DBML component barrel exports", () => {
  it("re-exports core component helpers", () => {
    expect(components.getDbmlType).toBe(getDbmlType);
    expect(components.formatColumnSettings).toBe(formatColumnSettings);
    expect(components.DbmlTable).toBe(DbmlTable);
    expect(components.generateEnumDefinition).toBe(generateEnumDefinition);
  });
});
