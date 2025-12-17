
/**
 * Intercepts console logs and alerts to send them to the Vite server console
 * This allows the agent to see browser errors in the terminal
 */
export function initRemoteLogger() {
    if (!import.meta.env.DEV) return;

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalAlert = window.alert;

    const sendLog = (type: string, args: any[]) => {
        try {
            // Simple serialization of args
            const sanitizedArgs = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            });

            fetch('/__log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, args: sanitizedArgs })
            }).catch(() => { /* ignore logging errors */ });
        } catch { /* ignore */ }
    };

    console.log = (...args) => {
        originalLog.apply(console, args);
        sendLog('log', args);
    };

    console.error = (...args) => {
        originalError.apply(console, args);
        sendLog('error', args);
    };

    console.warn = (...args) => {
        originalWarn.apply(console, args);
        sendLog('warn', args);
    };

    window.alert = (message) => {
        sendLog('ALERT', [message]);
        // Still show the alert in UI
        originalAlert(message);
    };

    console.log('[RemoteLogger] Initialized and sending logs to terminal');
}
