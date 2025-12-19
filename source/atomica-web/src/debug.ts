/**
 * Debug script to help trace browser errors in the terminal
 *
 * Import this in main.tsx to capture all console errors and send them to the server
 */

// Capture all console errors and warnings
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

console.error = (...args) => {
  originalError.apply(console, args);
  // Send to a debug endpoint if needed
  sendDebugMessage("ERROR", args);
};

console.warn = (...args) => {
  originalWarn.apply(console, args);
  sendDebugMessage("WARN", args);
};

console.log = (...args) => {
  originalLog.apply(console, args);
  sendDebugMessage("LOG", args);
};

function sendDebugMessage(level: string, args: unknown[]) {
  try {
    const message = args
      .map((arg) => {
        if (arg instanceof Error) {
          return `${arg.name}: ${arg.message}\n${arg.stack}`;
        }
        if (typeof arg === "object") {
          return JSON.stringify(arg, null, 2);
        }
        return String(arg);
      })
      .join(" ");

    // For now, just make it visible in Vite's HMR overlay
    console.log(`[${level}]`, message);
  } catch (e) {
    originalError("Failed to send debug message:", e);
  }
}

// Capture unhandled errors
window.addEventListener("error", (event) => {
  originalError("Unhandled error:", event.error);
  sendDebugMessage("UNHANDLED ERROR", [event.error]);
});

// Capture unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  originalError("Unhandled promise rejection:", event.reason);
  sendDebugMessage("UNHANDLED REJECTION", [event.reason]);
});

export {};
