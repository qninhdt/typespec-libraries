import { findTestPackageRoot, type TypeSpecTestLibrary } from "@typespec/compiler/testing";
import { resolvePath } from "@typespec/compiler";

const packageRoot = await findTestPackageRoot(import.meta.url);

export const TypeSpecProtobufTestLibrary: TypeSpecTestLibrary = {
  name: "@qninhdt/typespec-protobuf",
  packageRoot,
  files: [
    { realDir: "", pattern: "package.json", virtualPath: `./node_modules/@qninhdt/typespec-protobuf` },
    {
      realDir: "lib",
      pattern: "**/*.tsp",
      virtualPath: resolvePath("./node_modules/@qninhdt/typespec-protobuf", "lib"),
    },
    {
      realDir: "lib",
      pattern: "**/*.js",
      virtualPath: resolvePath("./node_modules/@qninhdt/typespec-protobuf", "lib"),
    },
    {
      realDir: "dist/src",
      pattern: "**/*.js",
      virtualPath: resolvePath("./node_modules/@qninhdt/typespec-protobuf", "dist/src"),
    },
  ],
};
