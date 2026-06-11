import { describe, expect, it } from "vitest";
import { renderPyOutput } from "./utils.jsx";
import { getOutputFileContent } from "@qninhdt/typespec-orm/testing";

describe("SQLModel user-defined scalar constraint deduplication", () => {
  it("does not duplicate scalar constraints on @table model property", async () => {
    const output = await renderPyOutput(`
      @minValue(18) @maxValue(150)
      scalar AdultAge extends int32;

      @table
      model User {
        @key id: uuid;
        age: AdultAge;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");
    const modelFile = getOutputFileContent(output, "user.py");

    expect(scalarsFile).toContain("ge=18");
    expect(scalarsFile).toContain("le=150");
    expect(modelFile).not.toContain("ge=18");
    expect(modelFile).not.toContain("le=150");
  });

  it("does not duplicate scalar constraints on @data model property", async () => {
    const output = await renderPyOutput(`
      @minLength(8) @maxLength(128)
      scalar StrongPassword extends string;

      model LoginForm {
        password: StrongPassword;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");
    const modelFile = getOutputFileContent(output, "login_form.py");

    expect(scalarsFile).toContain("min_length=8");
    expect(scalarsFile).toContain("max_length=128");
    expect(modelFile).not.toContain("min_length=8");
    expect(modelFile).not.toContain("max_length=128");
  });

  it("emits only property-level override when narrower than scalar", async () => {
    const output = await renderPyOutput(`
      @minValue(0) @maxValue(150)
      scalar Age extends int32;

      @table
      model Player {
        @key id: uuid;
        @maxValue(13) age: Age;
      }
    `);
    const modelFile = getOutputFileContent(output, "player.py");

    expect(modelFile).toContain("le=13");
    expect(modelFile).not.toContain("ge=0");
    expect(modelFile).not.toContain("le=150");
  });

  it("emits property override on @data model when narrower", async () => {
    const output = await renderPyOutput(`
      @minValue(0) @maxValue(100)
      scalar Percentage extends float64;

      model StatsForm {
        @maxValue(50) halfPercentage: Percentage;
      }
    `);
    const modelFile = getOutputFileContent(output, "stats_form.py");

    expect(modelFile).toContain("le=50");
    expect(modelFile).not.toContain("ge=0");
    expect(modelFile).not.toContain("le=100");
  });

  it("emits property pattern override without duplicating scalar pattern", async () => {
    const output = await renderPyOutput(`
      @pattern("^[A-Z]+$")
      scalar UpperCase extends string;

      model Input {
        @pattern("^[A-Z]{3}$") code: UpperCase;
      }
    `);
    const modelFile = getOutputFileContent(output, "input.py");

    expect(modelFile).toContain("^[A-Z]{3}$");
    expect(modelFile).not.toContain("^[A-Z]+$");
  });
});
