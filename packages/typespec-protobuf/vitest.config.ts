import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/**/*.d.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/testing/**", "src/index.ts", "src/lib.ts"],
      reporter: ["text", "json", "html", "lcov"],
    },
    pool: "forks",
    isolate: false,
    maxWorkers: 1,
  },
});
