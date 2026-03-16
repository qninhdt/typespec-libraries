import {
  createTestLibrary,
  findTestPackageRoot,
  type TypeSpecTestLibrary,
} from "@typespec/compiler/testing";

export const TypeSpecDbmlTestLibrary: TypeSpecTestLibrary = createTestLibrary({
  name: "@qninhdt/typespec-dbml",
  packageRoot: await findTestPackageRoot(import.meta.url),
});
