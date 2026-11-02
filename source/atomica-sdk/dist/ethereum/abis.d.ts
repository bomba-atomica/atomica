/**
 * Contract ABIs for FakeETH and FakeUSD tokens
 *
 * These ABIs define the interface for interacting with the ERC20 contracts
 */
export declare const FAKE_ETH_ABI: readonly ["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)", "function approve(address spender, uint256 amount) returns (bool)", "function transferFrom(address from, address to, uint256 amount) returns (bool)", "event Transfer(address indexed from, address indexed to, uint256 value)", "event Approval(address indexed owner, address indexed spender, uint256 value)", "function mint(address to, uint256 amount)", "function MAX_MINT_AMOUNT() view returns (uint256)"];
export declare const FAKE_USD_ABI: readonly ["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)", "function approve(address spender, uint256 amount) returns (bool)", "function transferFrom(address from, address to, uint256 amount) returns (bool)", "event Transfer(address indexed from, address indexed to, uint256 value)", "event Approval(address indexed owner, address indexed spender, uint256 value)", "function mint(address to, uint256 amount)", "function MAX_MINT_AMOUNT() view returns (uint256)"];
export type FakeETHABI = typeof FAKE_ETH_ABI;
export type FakeUSDABI = typeof FAKE_USD_ABI;
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
export declare const BLS_VERIFIER_TESTNET_ABI: readonly ["function trustedRelayer() view returns (address)", "function verifyBlockHash(bytes32 blockHash, bytes calldata sig) view returns (bool)", "function authorizeSettlement(uint64 windowId, bytes32 pairHash, uint64 clearingPrice, address[] calldata winners, uint256[] calldata fills) external", "event SettlementAuthorized(uint64 indexed windowId, bytes32 indexed pairHash, uint64 clearingPrice, address[] winners, uint256[] fills)", "error NotTrustedRelayer(address caller)", "error WinnersFillesMismatch(uint256 winnersLen, uint256 fillsLen)"];
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
export declare const SETTLEMENT_ABI: readonly ["function latestVerifiedBlockHash() view returns (bytes32)", "function lastSettlementBlock() view returns (uint256)", "function processedTrades(bytes32 tradeId) view returns (bool)", "function isTradeProcessed(bytes32 blockHash, bytes32 stateRoot, uint256 clearingPrice) view returns (bool)", "function getContractBalances() view returns (uint256 ethBalance, uint256 usdcBalance)", "function settle(bytes32 blockHash, bytes32 stateRoot, tuple(uint256 clearingPrice, bytes32 ethStateRoot, uint256 minNonce, uint256 maxNonce) tradeResult, bytes calldata blsSignature, uint256[] calldata validatorIndices, uint64[] calldata auctionIds, address[] calldata winners, address[] calldata depositors, uint256[] calldata nonces, uint256[] calldata ethAmounts, uint256[] calldata usdcAmounts) external returns (bool)", "event SettlementVerified(bytes32 indexed blockHash, bytes32 indexed stateRoot, uint256 clearingPrice)", "event VerificationFailed(string reason)"];
/** Type exports for settlement bridge ABIs */
export type BLSVerifierTestnetABI = typeof BLS_VERIFIER_TESTNET_ABI;
export type SettlementABI = typeof SETTLEMENT_ABI;
