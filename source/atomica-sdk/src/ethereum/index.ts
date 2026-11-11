/**
 * Ethereum Integration Layer
 *
 * Main export file for Ethereum testnet integration
 */

// Configuration
export * from "./config.js";

// ABIs
export * from "./abis.js";

// Contracts
export * from "./contracts.js";

// Transactions
export * from "./transaction.js";

// Balances
export * from "./balances.js";

// Lockbox
export * from "./lockbox.js";

// Lock binding (auction key, commitment, eth_lock_deadline)
export * from "./lock-binding.js";

// NOTE: proofs/generator is intentionally NOT re-exported here because it
// transitively imports @atomica/state-proof-verifier (heavy Node.js deps)
// and would break browser-only consumers that only need contract ABIs / RPC
// helpers. Import proofs directly via:
//   import { generateLockedBalanceProof } from "@atomica/sdk/ethereum/proofs"
