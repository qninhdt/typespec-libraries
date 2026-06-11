import {
  createTestHost as coreCreateTestHost,
  createTestWrapper,
} from "@typespec/compiler/testing";
import { TypeSpecProtobufOpenletTestLibrary } from "../src/testing/index.js";
import { TypeSpecOrmTestLibrary } from "@qninhdt/typespec-orm/testing";

export async function createTestHost() {
  return coreCreateTestHost({
    libraries: [TypeSpecProtobufOpenletTestLibrary],
  });
}

export async function createTestRunner() {
  const host = await createTestHost();
  return createTestWrapper(host, {
    wrapper: (code) => `using Openlet.Proto;\nnamespace Test {\n${code}\n}`,
  });
}

/**
 * Test host + runner with BOTH the proto and orm libraries mounted, for
 * `@entity` cross-emitter tests. Brings `Qninhdt.Orm` and `Openlet.Proto`
 * into scope. ORM scalars (`uuid`, `text`, ...) are available.
 */
export async function createEntityTestHost() {
  return coreCreateTestHost({
    libraries: [TypeSpecProtobufOpenletTestLibrary, TypeSpecOrmTestLibrary],
  });
}

export async function createEntityTestRunner() {
  const host = await createEntityTestHost();
  return createTestWrapper(host, {
    wrapper: (code) => `using Openlet.Proto;\nusing Qninhdt.Orm;\nnamespace Test {\n${code}\n}`,
  });
}
