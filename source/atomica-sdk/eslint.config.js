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
            project: "./tsconfig.lint.json",
            tsconfigRootDir: import.meta.dirname,
        },
    },
  },
  {
    files: ["src/global.d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
