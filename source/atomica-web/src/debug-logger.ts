// Import interface implicitly (copying definition to avoid circular deposit issues if needed, but better to import)
// We'll reimplement send logic to match LogEntry schema
function getCallSite(): { file: string; line: number } | undefined {
    try {
        const err = new Error();
        // Stack index 4 (Error -> getCallSite -> sendLog -> console.wrapper -> Caller)
        const line = err.stack?.split("\n")[4];
        if (!line) return undefined;
        const match = line.match(/(?:\((.*):(\d+):(\d+)\))|(?:\s+at\s+)(.*):(\d+):(\d+)/);
        const path = match?.[1] || match?.[4];
        const lineNum = match?.[2] || match?.[5];
        if (path && lineNum) {
            // Remove protocol, query params (?t=...), and leading slash if needed
            let clean = path.replace(/https?:\/\/[^/]+/, "");
            clean = clean.split('?')[0]; // Remove query params
            return { file: clean || path, line: parseInt(lineNum, 10) };
        }
    } catch { return undefined; }
}

export function initRemoteLogger() {
    if (!import.meta.env.DEV) return;

    if ((window as any).__remoteLoggerInitialized) return;
    (window as any).__remoteLoggerInitialized = true;

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalAlert = window.alert;

    function safeStringify(obj: any): string {
        const seen = new WeakSet();
        return JSON.stringify(obj, (_key, value) => {
            if (typeof value === "bigint") {
                return value.toString();
            }
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                    return "[Circular]";
                }
                seen.add(value);
            }
            return value;
        }, 2);
    }

    function send(level: "info" | "warn" | "error" | "debug", args: any[]) {
        try {
            const entry = {
                level,
                message: args.map(a => {
                    if (typeof a === 'string') return a;
                    try {
                        return safeStringify(a);
                    } catch (e) {
                        return `[Log Serialization Error: ${e}]`;
                    }
                }),
                timestamp: new Date().toISOString(),
                source: getCallSite(),
                context: {} // Optional extra context
            };

            fetch('/__log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry),
                keepalive: true, // Ensure logs survive page unload
            }).catch((e) => {
                // Last ditch effort to log locally if transport fails
                originalError.call(console, "[RemoteLogger] Transport failed:", e);
            });
        } catch (e) {
            originalError.call(console, "[RemoteLogger] Send failed:", e);
        }
    }

    console.log = (...args) => { originalLog.apply(console, args); send('info', args); };
    console.warn = (...args) => { originalWarn.apply(console, args); send('warn', args); };
    console.error = (...args) => { originalError.apply(console, args); send('error', args); };
    console.debug = (...args) => { originalLog.apply(console, args); send('debug', args); }; // Map debug to info/debug
    console.info = (...args) => { originalLog.apply(console, args); send('info', args); };

    console.assert = (assertion, ...args) => {
        if (!assertion) {
            originalError.apply(console, ["Assertion failed:", ...args]);
            send('error', ["Assertion failed:", ...args]);
        }
    };

    window.alert = (msg) => {
        send('warn', [`[ALERT] ${msg}`]);
        originalAlert(msg);
    };

    window.addEventListener('error', e => send('error', [`Uncaught: ${e.message}`]));
    window.addEventListener('unhandledrejection', e => send('error', [`Unhandled Rejection: ${e.reason}`]));

    console.log('[RemoteLogger] v2 Initialized');
}
