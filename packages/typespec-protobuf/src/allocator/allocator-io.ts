import {
  parseAllocationTable,
  serializeAllocationTable,
  type AllocationTable,
} from "./allocation-table.js";

/**
 * Filesystem boundary for the allocator. Kept as an injectable interface so
 * the emitter can pass `program.host` adapters and tests can pass in-memory
 * maps — the reconcile logic itself stays pure.
 */
export interface AllocatorIo {
  /** Return the file's text, or undefined when it does not exist. */
  readFile(path: string): Promise<string | undefined>;
  /** Write the file's text. */
  writeFile(path: string, content: string): Promise<void>;
}

/**
 * Load the allocation table from disk. Returns an empty table when the file
 * does not exist (first run). Propagates parse errors so a corrupt file fails
 * loudly.
 */
export async function loadAllocationTable(io: AllocatorIo, path: string): Promise<AllocationTable> {
  const text = await io.readFile(path);
  if (text === undefined || text.trim() === "") {
    return new Map();
  }
  const json = JSON.parse(text);
  return parseAllocationTable(json);
}

/**
 * Serialize + write the allocation table with a stable 2-space indent and a
 * trailing newline so git diffs stay minimal and deterministic.
 */
export async function saveAllocationTable(
  io: AllocatorIo,
  path: string,
  table: AllocationTable,
): Promise<void> {
  const json = serializeAllocationTable(table);
  const text = JSON.stringify(json, null, 2) + "\n";
  await io.writeFile(path, text);
}

/**
 * Adapt a TypeSpec `program.host` to the {@link AllocatorIo} interface.
 * `host.readFile` throws on ENOENT, which we translate to `undefined`.
 */
export function hostAllocatorIo(host: {
  readFile(path: string): Promise<{ text: string }>;
  writeFile(path: string, content: string): Promise<void>;
}): AllocatorIo {
  return {
    async readFile(path) {
      try {
        const file = await host.readFile(path);
        return file.text;
      } catch {
        return undefined;
      }
    },
    writeFile: (path, content) => host.writeFile(path, content),
  };
}
