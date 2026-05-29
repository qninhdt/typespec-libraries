import {
  createTestHost as coreCreateTestHost,
  createTestWrapper,
} from "@typespec/compiler/testing";
import { TypeSpecProtobufOpenletTestLibrary } from "../src/testing/index.js";

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
