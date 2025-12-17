
/**
 * Structured Log Entry
 */
export interface LogEntry {
    level: "info" | "warn" | "error" | "debug" | "trace";
    message: string[];
    timestamp: string;
    source?: {
        file: string;
        line: number;
        function?: string;
    };
    context?: Record<string, any>;
}

/**
 * Parses an Error stack trace to find the call site
 */
function getCallSite(stackIndex = 2): LogEntry["source"] | undefined {
    try {
        const err = new Error();
        if (!err.stack) return undefined;

        // Split stack, ignore "Error" line and this function's frame
        const lines = err.stack.split("\n");
        // Format: "    at details (http://localhost:5173/src/components/SanityTest.tsx:55:25)"
        // Or: "    at http://localhost:5173/src/utils/logger.ts:45:10"

        // We want the frame at stackIndex (default 2: 0=Error, 1=getCallSite, 2=Logger.log, 3=Caller)
        // Adjust based on Chrome/V8 stack format
        const frame = lines[stackIndex];
        if (!frame) return undefined;

        // Regex to extract file path and line/col
        const match = frame.match(/(?:\((.*):(\d+):(\d+)\))|(?:\s+at\s+)(.*):(\d+):(\d+)/);

        // Groups: 1=Path(paren), 2=Line, 3=Col, 4=Path(no paren), 5=Line, 6=Col
        const path = match?.[1] || match?.[4];
        const line = match?.[2] || match?.[5];

        if (path && line) {
            // Clean up path: remove protocol and query/hash
            let cleanPath = path.replace(/https?:\/\/[^/]+/, "");
            cleanPath = cleanPath.split('?')[0]; // Remove query params
            // If empty (root), keep it
            if (!cleanPath) cleanPath = path;

            return {
                file: cleanPath,
                line: parseInt(line, 10),
            };
        }
    } catch {
        return undefined;
    }
}

/**
 * Sends structured log to the Vite server middleware
 */
function transport(entry: LogEntry) {
    if (!import.meta.env.DEV) return;

    // Safe serialization handling circular refs and BigInt
    const seen = new WeakSet();
    const body = JSON.stringify(entry, (_key, value) => {
        if (typeof value === "bigint") {
            return value.toString();
        }
        if (typeof value === "object" && value !== null) {
            if (value instanceof Error) {
                return { message: value.message, stack: value.stack, name: value.name };
            }
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    });

    fetch("/__log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    }).catch(() => { }); // Fire and forget
}

export class Logger {
    static info(...args: any[]) {
        this.log("info", args);
    }

    static warn(...args: any[]) {
        this.log("warn", args);
    }

    static error(...args: any[]) {
        this.log("error", args);
    }

    static debug(...args: any[]) {
        this.log("debug", args);
    }

    private static log(level: LogEntry["level"], args: any[]) {
        // 1. Capture metadata
        const entry: LogEntry = {
            level,
            message: args.map(String), // Serialize basic message parts
            context: args.find(a => typeof a === 'object' && a !== null && !Array.isArray(a)), // Approximate context finding
            timestamp: new Date().toISOString(),
            source: getCallSite(3), // Adjust stack index to find caller of info/warn/etc
        };

        // 2. Transport to server
        transport(entry);

        // 3. Fallback to browser console (standard behavior)
        // Prevent infinite loop if we monitor console elsewhere?
        // We assume debug-logger will NOT hook Logger calls if we use this directly,
        // OR we should bypass debug-logger hooks.
        // For now, let's allow it to hit console, but debug-logger needs to be smart enough not to double-send.
        // Actually, if we use Logger, we want that to be the source of truth.
    }
}
