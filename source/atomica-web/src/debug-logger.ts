// Import interface implicitly (copying definition to avoid circular deposit issues if needed, but better to import)
// We'll reimplement send logic to match LogEntry schema
// We'll reimplement send logic to match LogEntry schema
function getCallSite(): { file: string; line: number } | undefined {
    try {
        const err = new Error();
        const stack = err.stack;
        if (!stack) return undefined;

        const lines = stack.split("\n");
        // Iterate to find first line that isn't this file or internal
        for (const line of lines) {
            // Skip Error header or internal files
            if (line.includes("debug-logger")) continue;
            if (line.includes("Error")) continue;

            // Match chrome/v8 format: at function (file:line:col) or at file:line:col
            const match = line.match(/(?:\((.*):(\d+):(\d+)\))|(?:\s+at\s+)(.*):(\d+):(\d+)/);
            const path = match?.[1] || match?.[4];
            const lineNum = match?.[2] || match?.[5];

            if (path && lineNum) {
                // Remove protocol, query params (?t=...), and leading slash if needed
                let clean = path.replace(/https?:\/\/[^/]+/, "");
                clean = clean.split('?')[0]; // Remove query params

                // If clean is empty or still "debug-logger", continue
                if (!clean || clean.includes("debug-logger")) continue;

                return { file: clean || path, line: parseInt(lineNum, 10) };
            }
        }
        return undefined;
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
            if (value instanceof Error) {
                return { message: value.message, stack: value.stack, name: value.name };
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

    // Capture table, trace, dir
    console.table = (...args) => { originalLog.apply(console, args); send('info', ["[TABLE]", ...args]); };
    console.trace = (...args) => { originalLog.apply(console, args); send('debug', ["[TRACE]", ...args]); };
    console.dir = (...args) => { originalLog.apply(console, args); send('debug', ["[DIR]", ...args]); };

    // Capture global errors (including resource errors via capture phase)
    window.addEventListener('error', (event) => {
        // Resource errors (img/script 404) don't have event.error, but have event.target
        // Check if it's an Element (not window)
        const target = event.target;
        if (target instanceof HTMLElement) {
            const src = (target as any).src || (target as any).href;
            if (src) {
                send('error', [`[Resource Error] Failed to load ${target.tagName}: ${src}`]);
                return;
            }
        }

        // Runtime JS errors
        const err = event.error;
        if (err instanceof Error) {
            send('error', [`Uncaught Exception: ${err.message}`, err.stack]);
        } else {
            send('error', [`Uncaught Exception: ${event.message}`]);
        }
    }, true); // useCapture = true to catch non-bubbling resource errors

    window.addEventListener('unhandledrejection', e => {
        const reason = e.reason;
        if (reason instanceof Error) {
            send('error', [`Unhandled Rejection: ${reason.message}`, reason.stack]);
        } else {
            send('error', [`Unhandled Rejection: ${String(reason)}`]);
        }
    });

    // Intercept Fetch to log network errors (4xx/5xx) that console.error misses
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
        // Don't intercept the logger itself!
        if (typeof input === 'string' && input.includes('__log')) {
            return originalFetch(input, init);
        }

        try {
            const response = await originalFetch(input, init);
            if (!response.ok) {
                // Clone strictly for logging to avoid consuming the stream body
                const clone = response.clone();
                // Optionally read body if text?
                clone.text().then(text => {
                    let bodySnippet = text.slice(0, 200);
                    const status = response.status;
                    const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
                    send('error', [`[Network Error] ${status} ${response.statusText} on ${url}`, bodySnippet]);
                }).catch(() => {
                    const status = response.status;
                    const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
                    send('error', [`[Network Error] ${status} ${response.statusText} on ${url}`]);
                });
            }
            return response;
        } catch (e: any) {
            const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
            send('error', [`[Network Request Failed] ${url}: ${e.message}`]);
            throw e;
        }
    };

    console.log('[RemoteLogger] v2.2 Initialized (Full Capture + Network)');
}
