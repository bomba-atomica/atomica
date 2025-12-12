import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Enable verbose logging to help debug browser errors
    strictPort: false,
    // Log browser console errors to terminal
    hmr: {
      overlay: true, // Show errors in browser overlay
    },
  },
  // Enable source maps for better error messages
  build: {
    sourcemap: true,
  },
});
