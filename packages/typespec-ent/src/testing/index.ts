import {
  createTestLibrary,
  findTestPackageRoot,
  type TypeSpecTestLibrary,
} from "@typespec/compiler/testing";

export const TypeSpecEntTestLibrary: TypeSpecTestLibrary = createTestLibrary({
  name: "@qninhdt/typespec-ent",
  packageRoot: await findTestPackageRoot(import.meta.url),
});
