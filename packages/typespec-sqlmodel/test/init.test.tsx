import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel __init__.py generation", () => {
  it("generates __init__.py with all model imports and __all__", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @id id: uuid;
        name: string;
      }

      @table
      model Post {
        @id id: uuid;
        title: string;
      }

      @data("Form")
      model CreateUserForm {
        name: string;
      }
    `,
      "__init__.py",
    );

    // Module docstring
    expect(output).toContain("auto-generated models. DO NOT EDIT.");

    // Import each model from its module
    expect(output).toContain("from .user import User");
    expect(output).toContain("from .post import Post");
    expect(output).toContain("from .create_user_form import CreateUserForm");

    // __all__ list
    expect(output).toContain("__all__ = [");
    expect(output).toContain('"User"');
    expect(output).toContain('"Post"');
    expect(output).toContain('"CreateUserForm"');
  });
});
