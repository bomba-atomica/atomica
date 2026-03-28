# Test Fix Plan: `lock-receipt-e2e` & `proof-generation`

**Context:**
We are finalizing the migration from Anvil/Localnet to a **Dual Docker Testnet** (Ethereum PoS + Aptos) for the `atomica-web` package. The infrastructure tests are passing, but complex integration tests are failing due to PoS strictness and ABI mismatches.

## 1. Fix `proof-generation.test.ts` (REPLACEMENT_UNDERPRICED)
The PoS testnet has stricter mempool rules than Anvil (12s block times, nonce strictness).
- **Action:** Open `source/atomica-web/tests/meta/ethereum/proof-generation.test.ts`.
- **Action:** Review how transactions are sent.
- **Fix:** Ensure we are waiting for the transaction to be mined (waiting for receipt) before asserting or sending dependent transactions.
- **Fix:** If multiple txs are sent in parallel, manually manage nonces or serialize them.

## 2. Fix `lock-receipt-e2e.test.ts` (ABI & Encoding Errors)

### Part A: FakeETH Minting
The test fails calling `mint()` on `FakeETH` because the method signature likely differs or doesn't exist in the artifacts we are using.
- **Action:** Read `source/evm-contracts` to find the `FakeETH` solidity file and identify the correct minting function signature.
- **Action:** Update `source/atomica-web/tests/meta/cross-chain/lock-receipt-e2e.test.ts` to use the correct method name (e.g., `deposit`, `freeMint`, or just sending ETH if it's WETH).

### Part B: Aptos Hex Encoding
The test fails with `Uint8Array.prototype.fromHex` errors inside the Aptos interaction.
- **Action:** Inspect the specific call in `lock-receipt-e2e.test.ts` where we interact with Aptos (likely constructing a payload or address).
- **Fix:** Ensure hex strings passed to `fromHex` or Aptos SDK are stripped of `0x` prefixes if required and contain valid hex characters.

## Execution Order
1.  **Analyze**: Read the Solidity contract (`FakeETH`) and the failing test files.
2.  **Edit**: Apply fixes to `proof-generation.test.ts` (async/await txs).
3.  **Edit**: Apply fixes to `lock-receipt-e2e.test.ts` (ABI & Hex string cleanup).
4.  **Verify**: Run the tests using `npx vitest source/atomica-web/tests/meta/`.
