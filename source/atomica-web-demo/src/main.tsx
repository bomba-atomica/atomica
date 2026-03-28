import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initRemoteLogger } from "./debug-logger";
import { NetworkConfigProvider } from "./lib/network-config-context";

initRemoteLogger();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NetworkConfigProvider>
      <App />
    </NetworkConfigProvider>
  </StrictMode>,
);
