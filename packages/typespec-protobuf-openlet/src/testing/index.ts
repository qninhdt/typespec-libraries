import { findTestPackageRoot, type TypeSpecTestLibrary } from "@typespec/compiler/testing";
import { resolvePath } from "@typespec/compiler";

const packageRoot = await findTestPackageRoot(import.meta.url);

export const TypeSpecProtobufOpenletTestLibrary: TypeSpecTestLibrary = {
  name: "@qninhdt/typespec-protobuf-openlet",
  packageRoot,
  files: [
    {
      realDir: "",
      pattern: "package.json",
      virtualPath: `./node_modules/@qninhdt/typespec-protobuf-openlet`,
    },
    {
      realDir: "lib",
      pattern: "**/*.tsp",
      virtualPath: resolvePath("./node_modules/@qninhdt/typespec-protobuf-openlet", "lib"),
    },
    {
      realDir: "lib",
      pattern: "**/*.js",
      virtualPath: resolvePath("./node_modules/@qninhdt/typespec-protobuf-openlet", "lib"),
    },
    {
      realDir: "dist/src",
      pattern: "**/*.js",
      virtualPath: resolvePath("./node_modules/@qninhdt/typespec-protobuf-openlet", "dist/src"),
    },
  ],
};
