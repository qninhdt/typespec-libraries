import {
  createTestLibrary,
  findTestPackageRoot,
  type TypeSpecTestLibrary,
} from "@typespec/compiler/testing";

export const TypeSpecGormTestLibrary: TypeSpecTestLibrary = createTestLibrary({
  name: "@qninhdt/typespec-gorm",
  packageRoot: await findTestPackageRoot(import.meta.url),
});
