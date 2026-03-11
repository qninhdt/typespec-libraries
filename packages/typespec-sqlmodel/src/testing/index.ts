import {
  createTestLibrary,
  findTestPackageRoot,
  type TypeSpecTestLibrary,
} from "@typespec/compiler/testing";

export const TypeSpecSqlModelTestLibrary: TypeSpecTestLibrary = createTestLibrary({
  name: "@qninhdt/typespec-sqlmodel",
  packageRoot: await findTestPackageRoot(import.meta.url),
});
