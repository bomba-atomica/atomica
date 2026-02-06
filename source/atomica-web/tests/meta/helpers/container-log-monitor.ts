import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ContainerLogEntry {
  timestamp: string;
  level: string;
  message: string;
  raw: string;
}

export class ContainerLogMonitor {
  private logs: Map<string, ContainerLogEntry[]> = new Map();
  private errorKeywords = [
    "error",
    "fail",
    "panic",
    "fatal",
    "exception",
    "traceback",
    "abort",
    "crash",
  ];

  /**
   * Capture logs from a Docker container and parse them for errors.
   *
   * @param containerId - Docker container ID or name
   * @param label - Human-readable label for the container (e.g., "Ethereum", "Aptos")
   * @param options - Options for log capture
   * @param options.tail - Number of lines to tail (default: 100)
   * @param options.since - Time period to capture logs from (e.g., "5m", "1h")
   */
  async captureLogsFromContainer(
    containerId: string,
    label: string,
    options: {
      tail?: number;
      since?: string;
    } = {},
  ): Promise<void> {
    const { tail = 100, since } = options;

    try {
      let command = `docker logs ${containerId}`;

      if (since) {
        command += ` --since ${since}`;
      } else if (tail) {
        command += ` --tail ${tail}`;
      }

      const { stdout, stderr } = await execAsync(command);
      const combinedLogs = stdout + stderr;

      const entries = this.parseLogs(combinedLogs);
      this.logs.set(label, entries);

      console.log(
        `[Container Log Monitor] Captured ${entries.length} log entries from ${label}`,
      );

      const errorCount = entries.filter((e) => this.isErrorLog(e)).length;
      if (errorCount > 0) {
        console.warn(
          `[Container Log Monitor] Found ${errorCount} potential errors in ${label} logs`,
        );
      }
    } catch (error: any) {
      console.error(
        `[Container Log Monitor] Failed to capture logs from ${label}: ${error.message}`,
      );
    }
  }

  /**
   * Parse raw log output into structured log entries.
   */
  private parseLogs(rawLogs: string): ContainerLogEntry[] {
    const lines = rawLogs.split("\n").filter((line) => line.trim());

    return lines.map((line) => {
      // Try to parse structured logs (JSON)
      try {
        const json = JSON.parse(line);
        return {
          timestamp: json.timestamp || json.time || "",
          level: json.level || json.severity || "info",
          message: json.message || json.msg || line,
          raw: line,
        };
      } catch {
        // Plain text log
        return {
          timestamp: "",
          level: this.detectLogLevel(line),
          message: line,
          raw: line,
        };
      }
    });
  }

  /**
   * Detect log level from plain text log line.
   */
  private detectLogLevel(line: string): string {
    const lowerLine = line.toLowerCase();

    if (lowerLine.includes("error") || lowerLine.includes("err:")) {
      return "error";
    }
    if (lowerLine.includes("warn") || lowerLine.includes("warning")) {
      return "warn";
    }
    if (lowerLine.includes("debug") || lowerLine.includes("dbg:")) {
      return "debug";
    }

    return "info";
  }

  /**
   * Check if a log entry contains error indicators.
   */
  private isErrorLog(entry: ContainerLogEntry): boolean {
    const lowerMessage = entry.message.toLowerCase();
    const lowerLevel = entry.level.toLowerCase();

    if (lowerLevel === "error" || lowerLevel === "fatal") {
      return true;
    }

    return this.errorKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  /**
   * Check if any captured logs contain errors.
   */
  hasErrors(): boolean {
    for (const [_, entries] of this.logs) {
      if (entries.some((e) => this.isErrorLog(e))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get a summary of errors found in all containers.
   */
  getErrorSummary(): string {
    const summaries: string[] = [];

    for (const [label, entries] of this.logs) {
      const errors = entries.filter((e) => this.isErrorLog(e));

      if (errors.length > 0) {
        summaries.push(`\n${label} (${errors.length} errors):`);
        errors.slice(0, 5).forEach((error, i) => {
          summaries.push(
            `  ${i + 1}. [${error.level}] ${error.message.substring(0, 100)}`,
          );
        });

        if (errors.length > 5) {
          summaries.push(`  ... and ${errors.length - 5} more errors`);
        }
      }
    }

    return summaries.length > 0 ? summaries.join("\n") : "No errors found";
  }

  /**
   * Get all captured logs for a specific container.
   */
  getLogsForContainer(label: string): ContainerLogEntry[] {
    return this.logs.get(label) || [];
  }

  /**
   * Get all error logs for a specific container.
   */
  getErrorsForContainer(label: string): ContainerLogEntry[] {
    const logs = this.logs.get(label) || [];
    return logs.filter((e) => this.isErrorLog(e));
  }

  /**
   * Clear all captured logs.
   */
  clear(): void {
    this.logs.clear();
  }
}
