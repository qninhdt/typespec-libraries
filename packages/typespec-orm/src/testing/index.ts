import { findTestPackageRoot, type TypeSpecTestLibrary } from "@typespec/compiler/testing";
import { resolvePath } from "@typespec/compiler";

const packageRoot = await findTestPackageRoot(import.meta.url);

export const TypeSpecOrmTestLibrary: TypeSpecTestLibrary = {
  name: "@qninhdt/typespec-orm",
  packageRoot,
  files: [
    { realDir: "", pattern: "package.json", virtualPath: `./node_modules/@qninhdt/typespec-orm` },
    {
      realDir: "lib",
      pattern: "**/*.tsp",
      virtualPath: resolvePath("./node_modules/@qninhdt/typespec-orm", "lib"),
    },
    {
      realDir: "lib",
      pattern: "**/*.js",
      virtualPath: resolvePath("./node_modules/@qninhdt/typespec-orm", "lib"),
    },
    {
      realDir: "dist/src",
      pattern: "**/*.js",
      virtualPath: resolvePath("./node_modules/@qninhdt/typespec-orm", "dist/src"),
    },
  ],
};
