import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  {
    languageOptions: {
        parserOptions: {
            project: "./tsconfig.json",
            tsconfigRootDir: import.meta.dirname,
        },
    },
    rules: {
        // React-specific rules could go here if we added the react plugin,
        // but for now we'll stick to basic TS rules to get it passing.
        "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
        "@typescript-eslint/no-explicit-any": "warn" 
    }
  }
);
