/**
 * Test library marker - used to register the zod emitter in test hosts.
 * This is a placeholder that allows TypeSpec to discover the emitter without
 * loading any runtime code from the package.
 */
export const TypeSpecZodTestLibrary = {
  name: "@qninhdt/typespec-zod",
} as const;
