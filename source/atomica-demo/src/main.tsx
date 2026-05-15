import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initRemoteLogger } from "./debug-logger";
import {
  AppStateProvider,
  NetworkConfigProvider,
} from "@atomica/atomica-web-components";

initRemoteLogger();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* AppStateProvider is the outermost provider — all child providers read
        from / write to it instead of maintaining independent state. */}
    <AppStateProvider>
      <NetworkConfigProvider>
        <App />
      </NetworkConfigProvider>
    </AppStateProvider>
  </StrictMode>,
);
