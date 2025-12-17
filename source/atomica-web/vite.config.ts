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
                const entry = JSON.parse(body);

                let source = "";
                if (entry.source?.file) {
                  const fname = entry.source.file.split('/').pop();
                  source = `\x1b[90m${fname}:${entry.source.line}\x1b[0m`;
                }

                // Join message parts
                const msg = Array.isArray(entry.message) ? entry.message.join(" ") : String(entry.message);

                // Construct log message
                const logMessage = `\x1b[90m(client)\x1b[0m ${source} ${msg}`;

                // Use Vite's built-in logger
                if (entry.level === "error") {
                  server.config.logger.error(logMessage, { timestamp: true });
                } else if (entry.level === "warn") {
                  server.config.logger.warn(logMessage, { timestamp: true });
                } else {
                  server.config.logger.info(logMessage, { timestamp: true });
                }
              } catch (e) {
                server.config.logger.error(`Failed to parse remote log: ${e}`, { timestamp: true });
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
