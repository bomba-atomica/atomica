export { Faucet } from "./components/Faucet";
export { SanityTest } from "./components/SanityTest";
export { AuctionCreator } from "./components/AuctionCreator";
export { AuctionBidder } from "./components/AuctionBidder";
export { AccountStatus } from "./components/AccountStatus";
export { NetworkStatus } from "./components/NetworkStatus";
export { TxButton } from "./components/TxButton";
export { SettleButton } from "./components/SettleButton";
// SCOUT(#236) REMOVE: drop the ClaimButton export with the component.
// SCOUT(#236) ADD: export AuctionRevealer, SellFlow and ReleaseButton here; SellFlow pulls @atomica/sdk/ethereum/proofs (Node-only dependencies) into every consumer of this index, so check the demo browser test first.
export { ClaimButton } from "./components/ClaimButton";
export { BidHistory } from "./components/BidHistory";
export type { BidHistoryEntry } from "./components/BidHistory";

export { useTokenBalances } from "./hooks/useTokenBalances";
export { useBidHistory } from "./hooks/useBidHistory";
export type { UseBidHistoryResult } from "./hooks/useBidHistory";
// SCOUT(#235) ADD: export saveBidOpening, loadBidOpening and clearBidOpening (stubs in storage/bidStorage.ts).
// SCOUT(#228) REMOVE: the bid opening exports that the salt issue (235) adds go away with the salt.
export {
  saveBidPrice,
  loadBidPrice,
  clearBidPrice,
} from "./storage/bidStorage";

export {
  WalletContext,
  WalletProvider,
  useWallet,
} from "./context/WalletContext";
export { BalancesProvider, useBalances } from "./context/BalancesContext";
export {
  ContractStatusProvider,
  useContractStatus,
} from "./context/ContractStatusContext";
export { NetworkConfigProvider } from "./network/network-config-context";
export { useNetworkConfig } from "./network/network-config-state";

// ── Centralized app state (Phase 3f) ──────────────────────────────────────────
export {
  AppStateProvider,
  useAppState,
  useWalletState,
  useNetworkState,
  usePollingState,
  useTxState,
  useConfigSnapshot,
} from "./state/app-state";
export type {
  AppState,
  AppAction,
  WalletState,
  NetworkState,
  PollingState,
  TxState,
} from "./state/app-state";
export {
  loadConfig,
  saveConfig,
  resetConfig,
  DEFAULT_CONFIG,
  CONFIG_VERSION,
} from "./state/app-config";
export type { AppConfig } from "./state/app-config";
export { AppSettings } from "./components/AppSettings";

// ── Permissionless unwind and reclaim (#195) ─────────────────────────────────
export { UnwindButton } from "./components/UnwindButton";
export type { UnwindButtonProps } from "./components/UnwindButton";
export { ReclaimLockButton } from "./components/ReclaimLockButton";
export type { ReclaimLockButtonProps } from "./components/ReclaimLockButton";

// ── Phase 3d — cross-chain settlement scaffold (#89) ─────────────────────────
export { SettlementStatus } from "./components/SettlementStatus";
export type { SettlementStatusProps } from "./components/SettlementStatus";
export { WithdrawWinnings } from "./components/WithdrawWinnings";
export type { WithdrawWinningsProps } from "./components/WithdrawWinnings";
