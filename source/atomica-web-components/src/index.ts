export { Faucet } from "./components/Faucet";
export { SanityTest } from "./components/SanityTest";
export { AuctionCreator } from "./components/AuctionCreator";
export { AuctionBidder } from "./components/AuctionBidder";
export { AccountStatus } from "./components/AccountStatus";
export { NetworkStatus } from "./components/NetworkStatus";
export { TxButton } from "./components/TxButton";
export { SettleButton } from "./components/SettleButton";
export { ClaimButton } from "./components/ClaimButton";
export { FeeRebateDisplay } from "./components/FeeRebateDisplay";
export { BidHistory } from "./components/BidHistory";
export type { BidHistoryEntry } from "./components/BidHistory";

export { useTokenBalances } from "./hooks/useTokenBalances";
export { useBidHistory } from "./hooks/useBidHistory";
export type { UseBidHistoryResult } from "./hooks/useBidHistory";
export { useFeeRebate } from "./hooks/useFeeRebate";
export type { FeeRebateResult } from "./hooks/useFeeRebate";
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

// ── Phase 3d — cross-chain settlement scaffold (#89) ─────────────────────────
export { SettlementStatus } from "./components/SettlementStatus";
export type { SettlementStatusProps } from "./components/SettlementStatus";
export { WithdrawWinnings } from "./components/WithdrawWinnings";
export type { WithdrawWinningsProps } from "./components/WithdrawWinnings";
