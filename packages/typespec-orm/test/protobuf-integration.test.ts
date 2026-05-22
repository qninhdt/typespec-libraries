import { resolvePath } from "@typespec/compiler";
import {
  createTestHost,
  createTestWrapper,
  findTestPackageRoot,
  type TypeSpecTestLibrary,
} from "@typespec/compiler/testing";
import { describe, expect, it } from "vitest";

const protobufPackageRoot = await findTestPackageRoot(import.meta.resolve("@typespec/protobuf"));

const TypeSpecProtobufTestLibrary: TypeSpecTestLibrary = {
  name: "@typespec/protobuf",
  packageRoot: protobufPackageRoot,
  files: [
    { realDir: "", pattern: "package.json", virtualPath: "./node_modules/@typespec/protobuf" },
    {
      realDir: "lib",
      pattern: "**/*.tsp",
      virtualPath: resolvePath("./node_modules/@typespec/protobuf", "lib"),
    },
    {
      realDir: "lib",
      pattern: "**/*.js",
      virtualPath: resolvePath("./node_modules/@typespec/protobuf", "lib"),
    },
    {
      realDir: "dist/src",
      pattern: "**/*.js",
      virtualPath: resolvePath("./node_modules/@typespec/protobuf", "dist/src"),
    },
  ],
};

describe("upstream Protobuf integration", () => {
  it("reports missing @field numbers through @typespec/protobuf", async () => {
    const host = await createTestHost({
      libraries: [TypeSpecProtobufTestLibrary],
    });
    const runner = createTestWrapper(host, {
      compilerOptions: {
        emit: ["@typespec/protobuf"],
        options: {
          "@typespec/protobuf": { noEmit: true },
        },
      },
    });

    const [, diagnostics] = await runner.compileAndDiagnose(`
      import "@typespec/protobuf";

      using Protobuf;

      @package({ name: "test.v1" })
      namespace Test.V1;

      @message
      model MissingFieldNumber {
        id: string;
      }
    `);

    expect(
      diagnostics.some(
        (diag) => diag.code === "@typespec/protobuf/field-index" && diag.severity === "error",
      ),
    ).toBe(true);
  });
});
