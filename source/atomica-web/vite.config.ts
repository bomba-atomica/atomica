import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "remote-console-logs",
      configureServer(server) {
        server.middlewares.use("/__log", (req, res, next) => {
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
              try {
                const { type, args } = JSON.parse(body);
                let color = "\x1b[37m"; // White
                if (type === "error") color = "\x1b[31m"; // Red
                if (type === "warn") color = "\x1b[33m"; // Yellow
                if (type === "ALERT") color = "\x1b[35m"; // Magenta
                console.log(`${color}[Browser ${type}]\x1b[0m`, ...args);
              } catch (e) {
                console.error("Failed to parse remote log", e);
              }
              res.statusCode = 200;
              res.end();
            });
          } else {
            next();
          }
        });
      },
    }
  ],
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
