import tseslint from "typescript-eslint";

export default tseslint.config(
  // --- Ignored paths ---
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.changeset/**", "**/outputs/**"],
  },

  // --- TypeScript source files ---
  ...tseslint.configs.recommended,
  {
    files: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    rules: {
      // Allow `any` in emitter code that deals with TypeSpec internals
      "@typescript-eslint/no-explicit-any": "off",
      // Allow unused vars when prefixed with _
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Keep consistent return types
      "@typescript-eslint/explicit-function-return-type": "off",
      // Allow non-null assertions in emitter code
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
