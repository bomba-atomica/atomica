import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
  },
  test: {
    globals: true, // Fixes describe is not defined
    environment: "jsdom", // Default to jsdom for unit tests
    // For integration tests using 'vitest/browser', we need browser mode enabled
    // But we'll exclude them from standard 'bun test' run if they require browser
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/integration/**"],
  },
});
