/**
 * Global error aggregator for tracking all errors during test runs.
 *
 * This singleton collects errors from various sources (transaction helpers,
 * contract calls, etc.) to ensure nothing is silently failing.
 */

export interface ErrorRecord {
  timestamp: number;
  source: string;
  error: Error;
  context?: Record<string, any>;
}

export class TestErrorAggregator {
  private errors: ErrorRecord[] = [];
  private maxErrors = 1000; // Prevent memory issues

  /**
   * Record an error from a specific source.
   *
   * @param source - Source of the error (e.g., "sendAndWaitForTx", "deployContract")
   * @param error - The error object
   * @param context - Optional context information
   */
  recordError(
    source: string,
    error: Error,
    context?: Record<string, any>,
  ): void {
    const record: ErrorRecord = {
      timestamp: Date.now(),
      source,
      error,
      context,
    };

    this.errors.push(record);

    // Prevent unbounded growth
    if (this.errors.length > this.maxErrors) {
      this.errors.shift(); // Remove oldest error
    }

    // Log immediately for visibility
    console.error(`[Error Aggregator] Error in ${source}: ${error.message}`);
    if (context) {
      console.error(`  Context: ${JSON.stringify(context, null, 2)}`);
    }
  }

  /**
   * Get all recorded errors.
   */
  getErrors(): ErrorRecord[] {
    return [...this.errors];
  }

  /**
   * Get errors from a specific source.
   */
  getErrorsFromSource(source: string): ErrorRecord[] {
    return this.errors.filter((e) => e.source === source);
  }

  /**
   * Check if any errors have been recorded.
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Get a formatted report of all errors.
   */
  getReport(): string {
    if (this.errors.length === 0) {
      return "No errors recorded";
    }

    const lines: string[] = [
      `\n${"=".repeat(80)}`,
      `ERROR AGGREGATOR REPORT`,
      `${"=".repeat(80)}`,
      `Total errors: ${this.errors.length}`,
      "",
    ];

    // Group errors by source
    const bySource = new Map<string, ErrorRecord[]>();
    for (const error of this.errors) {
      const list = bySource.get(error.source) || [];
      list.push(error);
      bySource.set(error.source, list);
    }

    // Report by source
    for (const [source, errors] of bySource) {
      lines.push(`${source} (${errors.length} errors):`);

      errors.slice(0, 5).forEach((record, i) => {
        const time = new Date(record.timestamp).toISOString();
        lines.push(`  ${i + 1}. [${time}] ${record.error.message}`);

        if (record.context) {
          lines.push(`     Context: ${JSON.stringify(record.context)}`);
        }
      });

      if (errors.length > 5) {
        lines.push(`  ... and ${errors.length - 5} more errors`);
      }

      lines.push("");
    }

    lines.push("=".repeat(80));

    return lines.join("\n");
  }

  /**
   * Clear all recorded errors.
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Get count of errors.
   */
  getErrorCount(): number {
    return this.errors.length;
  }
}

/**
 * Global singleton instance.
 */
export const errorAggregator = new TestErrorAggregator();
