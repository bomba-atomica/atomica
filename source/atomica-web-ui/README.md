# Atomica Web UI

React UI component library for Aptos blockchain applications with Ethereum wallet integration.

## Purpose

This package provides reusable React components for building Aptos dApps that use Ethereum wallets (MetaMask) for authentication and transaction signing.

## What's Inside

### UI Components

#### Account Management
- **`AccountStatus`**: Display account balance and status
- **`Faucet`**: Request testnet tokens (APT, FAKEETH, FAKEUSD)
- **`NetworkStatus`**: Show current blockchain network and block height

#### Transaction Components
- **`TxButton`**: Smart transaction button with simulate/submit workflow
  - Automatic simulation before submission
  - Gas estimation display
  - Error handling with detailed feedback
  - "Skip & Submit" option for advanced users

#### Auction Components
- **`AuctionCreator`**: Create sealed-bid auctions with IBE encryption
- **`AuctionBidder`**: Submit encrypted bids on auctions
- **`SanityTest`**: Development utility for testing signature verification

### Custom Hooks
- **`useTokenBalances`**: Hook for fetching account token balances
  - Polls for balance updates
  - Handles multiple token types (APT, FAKEETH, FAKEUSD)
  - Contract deployment detection

## Architecture

**Component Design**:
- Self-contained components with minimal props
- Built-in error handling and loading states
- Tailwind CSS styling
- TypeScript for type safety

**Dependencies**:
- `@atomica/sdk`: Core account and transaction utilities
- `@atomica/aptos-docker-testnet`: Test utilities (dev dependency)
- `@atomica/state-proof-verifier`: IBE encryption for auctions
- `react`: UI framework
- `ethers`: Ethereum wallet integration

## Testing

Component tests verify:
- Component rendering and user interactions
- Account connection flows
- Transaction submission (with simulation skip)
- Balance updates after transactions

Tests use Vitest browser mode with real browser environment.

Run tests:
```bash
bun test
```

## Component Examples

### TxButton
```tsx
import { TxButton } from "@atomica/atomica-web-ui";

<TxButton
  label="Mint 10 ETH"
  accountAddress={ethAddress}
  prepareTransaction={() => ({
    function: `${CONTRACT}::fake_eth::mint`,
    functionArguments: [1_000_000_000]
  })}
  onSuccess={(txHash) => console.log("Success!", txHash)}
/>
```

### AccountStatus
```tsx
import { AccountStatus, useTokenBalances } from "@atomica/atomica-web-ui";

function MyApp() {
  const balances = useTokenBalances(ethAddress);
  
  return <AccountStatus ethAddress={ethAddress} balances={balances} />;
}
```

## Styling

Components use Tailwind CSS with a dark theme:
- Background: `zinc-950`
- Text: `zinc-400`
- Accents: `zinc-100`
- Borders: `zinc-800`

Customize by wrapping in your own styled containers or overriding Tailwind classes.

## Development

Build the library:
```bash
bun run build
```

This generates:
- `dist/index.js`: ESM bundle
- `dist/index.d.ts`: TypeScript definitions

## Related Packages

- `@atomica/sdk`: Core SDK used by these components
- `@atomica/aptos-docker-testnet`: Testnet infrastructure for development
- `@atomica/atomica-web-demo`: Example app using these components
