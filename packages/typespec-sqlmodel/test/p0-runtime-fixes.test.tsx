import { describe, expect, it } from "vitest";
import { emitPyFile, createEmitterTestRunner } from "./utils.jsx";
import { generateInit } from "../src/components/PyConstants.js";

describe("P0 runtime fixes", () => {
  describe("__init__.py exports", () => {
    it("exports target_metadata exactly once when metadata is requested", () => {
      const output = generateInit({
        moduleName: "demo",
        models: [{ name: "User", moduleFile: "user" }],
        childPackages: [],
        includeMetadata: true,
      });

      expect(output).toContain("target_metadata = SQLModel.metadata");
      const matches = output.match(/"target_metadata"/g) ?? [];
      expect(matches.length).toBe(1);
    });

    it("dedupes __all__ entries and reports collisions", () => {
      const collisions: Array<{ name: string; packageName: string }> = [];
      const output = generateInit({
        moduleName: "demo",
        models: [
          { name: "User", moduleFile: "user" },
          { name: "User", moduleFile: "user_again" },
        ],
        childPackages: ["billing"],
        includeMetadata: false,
        reportCollision: (info) => collisions.push(info),
      });

      const userMatches = output.match(/"User"/g) ?? [];
      expect(userMatches.length).toBe(1);
      expect(collisions).toHaveLength(1);
      expect(collisions[0]).toMatchObject({ name: "User", packageName: "demo" });
    });

    it("flags collision when target_metadata is shadowed by a child package", () => {
      const collisions: Array<{ name: string; packageName: string }> = [];
      generateInit({
        moduleName: "demo",
        models: [],
        childPackages: ["target_metadata"],
        includeMetadata: true,
        reportCollision: (info) => collisions.push(info),
      });

      expect(collisions.find((c) => c.name === "target_metadata")).toBeTruthy();
    });
  });

  describe("Relationship back_populates", () => {
    it("derives back_populates on the many-to-one side from @mappedBy", async () => {
      const output = await emitPyFile(
        `
        @table
        model Author {
          @key id: uuid;
          @mappedBy("author") posts?: Post[];
        }

        @table
        model Post {
          @key id: uuid;
          authorId: uuid;
          @foreignKey("authorId") author: Author;
        }
      `,
        "post.py",
      );

      expect(output).toContain('Relationship(back_populates="posts")');
    });
  });

  describe("server_default rendering", () => {
    it("emits text() for boolean defaults", async () => {
      const output = await emitPyFile(
        `
        @table
        model Account {
          @key id: uuid;
          isActive: boolean = true;
        }
      `,
        "account.py",
      );

      expect(output).toContain('text("true")');
      expect(output).not.toContain('server_default="true"');
    });

    it("emits text() for SQL call expressions", async () => {
      const output = await emitPyFile(
        `
        @table
        model Account {
          @key id: uuid;
          token: string = "gen_random_uuid()";
        }
      `,
        "account.py",
      );

      expect(output).toContain('text("gen_random_uuid()")');
    });

    it("keeps numeric defaults as quoted string literals", async () => {
      const output = await emitPyFile(
        `
        @table
        model Account {
          @key id: uuid;
          credits: int32 = 0;
        }
      `,
        "account.py",
      );

      expect(output).toContain('"server_default": "0"');
      expect(output).not.toContain('text("0")');
    });

    it("keeps string defaults as quoted string literals", async () => {
      const output = await emitPyFile(
        `
        @table
        model Account {
          @key id: uuid;
          tier: string = "free";
        }
      `,
        "account.py",
      );

      expect(output).toContain('"server_default": "free"');
      expect(output).not.toContain('text("free")');
    });
  });

  describe("init-export-collision diagnostic", () => {
    it("does not fire under normal generation", async () => {
      const runner = await createEmitterTestRunner();
      const [, diagnostics] = await runner.compileAndDiagnose(`
        @table
        model User {
          @key id: uuid;
          name: string;
        }
      `);
      const hits = diagnostics.filter(
        (d) => d.code === "@qninhdt/typespec-sqlmodel/init-export-collision",
      );
      expect(hits.length).toBe(0);
    });
  });
});
