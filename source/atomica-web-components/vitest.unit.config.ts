/**
 * Vitest Configuration — Unit Tests (jsdom, no live chain)
 *
 * Runs only the unit test files in tests/unit/. Uses jsdom environment so
 * React component tests work without Playwright or a real browser. All SDK
 * and blockchain calls are mocked at the vi.mock() level.
 *
 * Usage:
 *   bun run test:unit
 *   cd source/atomica-web-components && bun run test -- unit/
 *
 * @see docs/specifications/web-architecture.md
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.tsx", "tests/unit/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
