import {
  createTestLibrary,
  findTestPackageRoot,
  type TypeSpecTestLibrary,
} from "@typespec/compiler/testing";

export const TypeSpecZodTestLibrary: TypeSpecTestLibrary = createTestLibrary({
  name: "@qninhdt/typespec-zod",
  packageRoot: await findTestPackageRoot(import.meta.url),
});
