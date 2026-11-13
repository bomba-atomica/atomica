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

/** `IAptosLightClient.SignedLedgerInfo` as an ABI tuple. */
const SIGNED_LEDGER_INFO_TUPLE =
  "(bytes ledgerInfoWithSignatures, bytes epochState, bytes signerPublicKeys, bytes signature)";

/** `IAptosLightClient.EventProof` as an ABI tuple. */
const EVENT_PROOF_TUPLE = `(${SIGNED_LEDGER_INFO_TUPLE} ledgerInfo, uint64 version, bytes transactionInfo, bytes transactionAccumulatorProof, uint64 eventIndex, bytes contractEvent, bytes eventAccumulatorProof)`;

// Aptos light client ABI (source/evm-contracts/src/aptos/IAptosLightClient.sol).
// Permissionless: anyone advances epochs and anyone verifies an event.
export const APTOS_LIGHT_CLIENT_ABI = [
  "function latestEpoch() view returns (uint64)",
  "function epochStateHash(uint64 epoch) view returns (bytes32)",
  "function maxEpochAge() view returns (uint64)",
  "function latestEpochTimestamp() view returns (uint64)",
  `function advanceEpoch(${SIGNED_LEDGER_INFO_TUPLE} ledgerInfo)`,
  `function verifyEvent(${EVENT_PROOF_TUPLE} proof, bytes typeTag) view returns (uint64 version, bytes eventData)`,
  "event EpochAdvanced(uint64 indexed epoch, bytes32 epochStateHash)",
  "error UnknownEpoch(uint64 epoch)",
  "error StaleEpoch(uint64 epoch, uint64 latestEpoch)",
  "error EpochAlreadyAdvanced(uint64 epoch)",
  "error StaleLightClient(uint64 latestEpoch, uint256 age)",
] as const;

// LockBox ABI - proof-gated escrow (source/evm-contracts/src/escrow/LockBox.sol).
// A lock leaves only by releaseByOutcome (a proven Aptos AuctionOutcome) or by
// reclaim to its depositor after its deadline. Anyone may call either, and
// anyone may carry an outcome with recordOutcome. There is no relayer.
// SCOUT(#222) EDIT: the comment above names two ways out of LockBox; reclaimUnpayable is a third.
export const LOCKBOX_ABI = [
  "function lock(address token, uint256 amount, uint64 windowId, bytes32 pairHash) returns (bytes32 lockId)",
  `function recordOutcome(${EVENT_PROOF_TUPLE} proof) returns (bytes32 key)`,
  // The Lock tuple keeps its deadline: the commitment binds it. It is always lockDeadline(windowId).
  // SCOUT(#222) ADD: a reclaimUnpayable(Lock l, Payout[] payouts, Leaf leaf) fragment next to this one, with its event and errors.
  "function reclaim((address depositor, address token, uint256 nonce, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline) l, (bytes32 lockId, bytes32 payoutsHash, uint256 index, bytes32[] proof)[] neighbours)",
  "function releaseByOutcome((address depositor, address token, uint256 nonce, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline) l, (address recipient, uint256 amount)[] payouts, (uint256 index, bytes32[] proof) leaf)",
  "function getLockId(address depositor, address token, uint256 nonce) pure returns (bytes32)",
  "function auctionKey(uint64 windowId, bytes32 pairHash) pure returns (bytes32)",
  "function currentWindowId() view returns (uint64)",
  "function windowClose(uint64 windowId) view returns (uint64)",
  "function lockDeadline(uint64 windowId) view returns (uint64)",
  "function windowSchedule() view returns (uint64 daySecs, uint64[] closeOffsetsSecs)",
  "function RECLAIM_DELAY() view returns (uint64)",
  "function commitmentStorageKey(bytes32 lockId) pure returns (bytes32)",
  "function commitments(bytes32 lockId) view returns (bytes32)",
  "function statuses(bytes32 lockId) view returns (uint8)",
  "function outcomes(bytes32 auctionKey) view returns (bytes32 root, uint64 leafCount)",
  "function auctionReclaimed(bytes32 auctionKey) view returns (bool)",
  "function nextLockNonce() view returns (uint256)",
  "function lightClient() view returns (address)",
  "event Locked(bytes32 indexed lockId, address indexed depositor, address indexed token, uint256 nonce, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline)",
  // `deadline` is lockDeadline(windowId); the auction key does not cover it.
  "event OutcomeRecorded(bytes32 indexed auctionKey, uint64 windowId, bytes32 pairHash, uint64 deadline, bytes32 root, uint64 leafCount, uint64 aptosVersion)",
  "event LockReleased(bytes32 indexed lockId, bytes32 indexed auctionKey)",
  "event LockReclaimed(bytes32 indexed lockId, address indexed depositor, uint256 amount)",
  "error LockNotOpen(bytes32 lockId, uint8 status)",
  "error OutcomeAlreadyRecorded(bytes32 auctionKey)",
  "error AuctionWasReclaimed(bytes32 auctionKey)",
  "error NoOutcome(bytes32 auctionKey)",
  "error DeadlineNotReached(uint64 deadline)",
  "error WindowClosed(uint64 windowId, uint64 current)",
  "error WindowTooFarAhead(uint64 windowId, uint64 current)",
  "error LockInTree(bytes32 lockId)",
  "error StaleEpoch(uint64 epoch, uint64 latestEpoch)",
  "error StaleLightClient(uint64 latestEpoch, uint256 age)",
] as const;

// SCOUT(#222) EDIT: confirm reclaimUnpayable ends a lock as Reclaimed (3); add a status here if LockBox adds one.
/** `LockBox.Status`: a lock leaves Open once. */
export const LOCK_STATUS = {
  None: 0,
  Open: 1,
  Released: 2,
  Reclaimed: 3,
} as const;

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
