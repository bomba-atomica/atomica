# atomica-web-components

Status: `live`

## Purpose

React UI component library and custom hooks for the Atomica auction interface. Provides all user-facing components — auction creation, bid submission, settlement, claim, fee-rebate display, bid history, and wallet/network context — as well as the React hooks that wire those components to on-chain state. Depends on `@atomica/sdk` for headless protocol logic and has zero awareness of testnet orchestration or deployment scripts.

## Public API surface

### Entry point

`src/index.ts` — re-exports everything below.

### Exported components

| Export | File |
|---|---|
| `Faucet` | `src/components/Faucet.tsx` |
| `SanityTest` | `src/components/SanityTest.tsx` |
| `AuctionCreator` | `src/components/AuctionCreator.tsx` |
| `AuctionBidder` | `src/components/AuctionBidder.tsx` |
| `AccountStatus` | `src/components/AccountStatus.tsx` |
| `NetworkStatus` | `src/components/NetworkStatus.tsx` |
| `TxButton` | `src/components/TxButton.tsx` |
| `SettleButton` | `src/components/SettleButton.tsx` |
| `ClaimButton` | `src/components/ClaimButton.tsx` |
| `FeeRebateDisplay` | `src/components/FeeRebateDisplay.tsx` |
| `BidHistory`, `BidHistoryEntry` | `src/components/BidHistory.tsx` |

### Exported hooks

| Export | File |
|---|---|
| `useTokenBalances` | `src/hooks/useTokenBalances.ts` |
| `useBidHistory`, `UseBidHistoryResult` | `src/hooks/useBidHistory.ts` |
| `useFeeRebate`, `FeeRebateResult` | `src/hooks/useFeeRebate.ts` |

### Exported context / providers

| Export | File |
|---|---|
| `WalletContext`, `WalletProvider`, `useWallet` | `src/context/WalletContext.tsx` |
| `BalancesProvider`, `useBalances` | `src/context/BalancesContext.tsx` |
| `ContractStatusProvider`, `useContractStatus` | `src/context/ContractStatusContext.tsx` |
| `NetworkConfigProvider` | `src/network/network-config-context.tsx` |
| `useNetworkConfig` | `src/network/network-config-state.ts` |

### Exported storage helpers

| Export | File |
|---|---|
| `saveBidPrice`, `loadBidPrice`, `clearBidPrice` | `src/storage/bidStorage.ts` |

## Dependents

- `source/atomica-demo` — imports all components and hooks from this package to build the auction demo application.

## See also

- `docs/architecture/v0-architecture.md` §1 — package layout and dependency rules
- `docs/specifications/prd.md` — user-facing feature requirements
