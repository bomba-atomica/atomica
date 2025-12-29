#!/usr/bin/env node
"use strict";
/**
 * Standalone probe utility for debugging Aptos testnet connectivity
 *
 * Usage:
 *   npm run build && node dist/probe.js [num_validators]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const numValidators = parseInt(process.argv[2] || "4", 10);
if (isNaN(numValidators) || numValidators < 1 || numValidators > 7) {
    console.error("Usage: probe.js [num_validators]");
    console.error("  num_validators must be between 1 and 7");
    process.exit(1);
}
(0, index_1.probeTestnet)(numValidators)
    .then((results) => {
    const exitCode = results.every((r) => r.apiReachable) ? 0 : 1;
    process.exit(exitCode);
})
    .catch((error) => {
    console.error("Probe failed:", error);
    process.exit(1);
});
