/**
 * Contract ABIs for FakeETH and FakeUSD tokens
 *
 * These ABIs define the interface for interacting with the ERC20 contracts
 */

// FakeETH ABI - ERC20 with mint function
export const FAKE_ETH_ABI = [
  // ERC20 Standard
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",

  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",

  // FakeETH Specific
  "function mint(address to, uint256 amount)",
  "function MAX_MINT_AMOUNT() view returns (uint256)",
] as const;

// FakeUSD ABI - ERC20 with mint function and 6 decimals
export const FAKE_USD_ABI = [
  // ERC20 Standard
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",

  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",

  // FakeUSD Specific
  "function mint(address to, uint256 amount)",
  "function MAX_MINT_AMOUNT() view returns (uint256)",
] as const;

// Type exports for TypeScript
export type FakeETHABI = typeof FAKE_ETH_ABI;
export type FakeUSDABI = typeof FAKE_USD_ABI;

// ============================================================
// Settlement bridge ABIs — scout stubs for issue #111
// ============================================================
//
// These ABI definitions are compile-clean stubs added by the
// v0 Beta Settlement Bridge integration scout (issue #111).
// They expose the exact call surfaces that bridge.ts (issue #112)
// must wire against.
//
// INTEGRATION RISK (scout #111):
//   Settlement.sol currently imports BLSVerifier (full BLS) but
//   testnet deployments inject BLSVerifierTestnet at the same
//   address via the constructor.  The call in Settlement.sol line
//   ~172 is:
//
//     blsVerifier.verifyBlockHash(blockHash, blsSignature, validatorIndices)
//
//   BLSVerifierTestnet.verifyBlockHash only accepts (blockHash, sig)
//   — the `validatorIndices` array is NOT in BLSVerifierTestnet's
//   interface.  This is a call-signature mismatch that will revert
//   at runtime unless Settlement.sol is also updated to match the
//   two-argument form, OR bridge.ts passes an empty array for
//   validatorIndices so the call routes through the trusted-relayer
//   path.  Issue #112 must resolve this before wiring is complete.
//
// @see source/evm-contracts/src/settlement/BLSVerifierTestnet.sol
// @see source/evm-contracts/src/Settlement.sol
// @see docs/architecture/v0-architecture.md §3.2

/**
 * ABI for BLSVerifierTestnet.sol — trusted-relayer stub.
 *
 * Extracted from source/evm-contracts/src/settlement/BLSVerifierTestnet.sol.
 * Used by bridge.ts::submitSettlement to call authorizeSettlement.
 *
 * Scout note (#111): bridge.ts calls authorizeSettlement directly on
 * BLSVerifierTestnet (not through Settlement.sol).  The Settlement.sol
 * `settle()` call-path is separate and requires resolving the
 * verifyBlockHash signature mismatch noted above.
 *
 * @see docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 * @see issue #112 — BLS relayer service implementation
 */
export const BLS_VERIFIER_TESTNET_ABI = [
  // ─── State views ─────────────────────────────────────────────
  "function trustedRelayer() view returns (address)",

  // ─── Verification ─────────────────────────────────────────────
  /** Trusted-relayer block-hash check.  Returns true iff msg.sender == trustedRelayer. */
  "function verifyBlockHash(bytes32 blockHash, bytes calldata sig) view returns (bool)",

  // ─── Settlement authorization ─────────────────────────────────
  /**
   * Authorize a settlement batch.  Only callable by trustedRelayer.
   *
   * AuctionSettled → authorizeSettlement field mapping (scout #111):
   *   AuctionSettled.window_id      → windowId    (u64  → uint64)
   *   keccak256(BCS(pair))          → pairHash    (bytes32)
   *   AuctionSettled.clearing_price → clearingPrice (u64 → uint64)
   *   derived from bid_results      → winners     (address[])
   *   AuctionSettled per-winner fill→ fills        (uint256[])
   *
   * OPEN QUESTION (#112): AuctionSettled does NOT include per-winner
   * Ethereum addresses or per-winner fill amounts directly.  The relayer
   * must join AuctionSettled with the bid_results (winner Aptos addresses
   * converted to Ethereum via zero-pad) to derive `winners` and `fills`.
   * This join requires an additional Aptos view call to
   * `auction::get_bid_results(windowId, pairBcs)` which is not yet exposed.
   */
  "function authorizeSettlement(uint64 windowId, bytes32 pairHash, uint64 clearingPrice, address[] calldata winners, uint256[] calldata fills) external",

  // ─── Events ───────────────────────────────────────────────────
  "event SettlementAuthorized(uint64 indexed windowId, bytes32 indexed pairHash, uint64 clearingPrice, address[] winners, uint256[] fills)",

  // ─── Errors ───────────────────────────────────────────────────
  "error NotTrustedRelayer(address caller)",
  "error WinnersFillesMismatch(uint256 winnersLen, uint256 fillsLen)",
] as const;

/**
 * ABI for Settlement.sol — atomic trade execution contract.
 *
 * Extracted from source/evm-contracts/src/Settlement.sol.
 *
 * Scout note (#111): Settlement.sol does NOT have a `withdrawWinnings`
 * function.  The WithdrawWinnings UI component calls bridge.ts
 * `submitSettlement`, which is intended to call authorizeSettlement on
 * BLSVerifierTestnet and then trigger Settlement.sol::settle().
 * Issue #113 must decide whether settlement is push (relayer calls settle)
 * or pull (winner calls a not-yet-implemented withdrawWinnings).  The
 * current Settlement.sol only implements the push path via `settle()`.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see issue #112 — BLS relayer service implementation
 * @see issue #113 — wire settlement UI to live on-chain data
 */
export const SETTLEMENT_ABI = [
  // ─── State views ─────────────────────────────────────────────
  "function latestVerifiedBlockHash() view returns (bytes32)",
  "function lastSettlementBlock() view returns (uint256)",
  "function processedTrades(bytes32 tradeId) view returns (bool)",
  "function isTradeProcessed(bytes32 blockHash, bytes32 stateRoot, uint256 clearingPrice) view returns (bool)",
  "function getContractBalances() view returns (uint256 ethBalance, uint256 usdcBalance)",

  // ─── Settlement execution ─────────────────────────────────────
  /**
   * Execute settlement for an auction using native state proofs.
   *
   * INTEGRATION RISK (#111): This function's blsVerifier reference points
   * to BLSVerifier.sol (three-arg verifyBlockHash).  Testnet deployments
   * inject BLSVerifierTestnet (two-arg verifyBlockHash).  Calls from
   * bridge.ts must pass a dummy validatorIndices array until Settlement.sol
   * is updated or replaced for v0.1 Beta.  Track in issue #112.
   */
  "function settle(bytes32 blockHash, bytes32 stateRoot, tuple(uint256 clearingPrice, bytes32 ethStateRoot, uint256 minNonce, uint256 maxNonce) tradeResult, bytes calldata blsSignature, uint256[] calldata validatorIndices, uint64[] calldata auctionIds, address[] calldata winners, address[] calldata depositors, uint256[] calldata nonces, uint256[] calldata ethAmounts, uint256[] calldata usdcAmounts) external returns (bool)",

  // ─── Events ───────────────────────────────────────────────────
  "event SettlementVerified(bytes32 indexed blockHash, bytes32 indexed stateRoot, uint256 clearingPrice)",
  "event VerificationFailed(string reason)",
] as const;

/** Type exports for settlement bridge ABIs */
export type BLSVerifierTestnetABI = typeof BLS_VERIFIER_TESTNET_ABI;
export type SettlementABI = typeof SETTLEMENT_ABI;
