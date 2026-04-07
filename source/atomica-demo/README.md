# atomica-demo

Status: `live`

## Purpose

Demo application showcasing Ethereum wallet integration with Aptos blockchain. Reference implementation for Aptos dApps that use Ethereum wallets (MetaMask) for authentication. Serves as both a working example and the integration test shell for end-to-end flows.

## What's Inside

### Demo Application

- **Auction Interface**: Create and bid on sealed-bid auctions
- **Token Faucet**: Request test tokens (APT, FAKEETH, FAKEUSD)
- **Account Dashboard**: View balances and account status
- **Sanity Tests**: Developer tools for testing signature verification

### Integration Tests

- **Wallet Integration**: MetaMask connection and account management
- **Fake Token Minting**: FAKEETH and FAKEUSD minting with both Ed25519 and SIWE
- **End-to-End Flows**: Complete user journeys from connection to transaction

## Architecture

### Tech Stack

- **React 19**: UI framework
- **Vite**: Build tool and dev server
- **TailwindCSS**: Styling
- **Ethers.js**: Ethereum wallet integration
- **Aptos TS SDK**: Blockchain interaction

### Dependencies

- `@atomica/atomica-web-ui`: Reusable UI components
- `@atomica/sdk`: Core account and transaction logic
- `@atomica/aptos-docker-testnet`: Local testnet for development
- `@atomica/state-proof-verifier`: IBE encryption for auctions

## Running the Demo

### Development Mode

```bash
# Start local testnet
cd ../docker-testnet/aptos-testnet
bun install && bun run build
docker compose up -d

# Start demo
cd ../../atomica-web-demo
bun install
bun run dev
```

Access at http://localhost:5173

### Testing

```bash
# Run integration tests
bun run test

# Run UI component tests
bun run test:ui
```

## Features

### 1. Account Management

- Connect MetaMask wallet
- Display Ethereum address
- Show derived Aptos address
- Real-time balance updates

### 2. Token Faucet

- Request APT tokens (gas)
- Mint FAKEETH test tokens
- Mint FAKEUSD test tokens
- Transaction status feedback

### 3. Auction System

- **Create Auction**: Lock FAKEETH and set minimum price
- **Place Bid**: Submit encrypted bids using IBE
- **Sealed-Bid**: Bids hidden until reveal phase
- **MPK Generation**: Automatic master public key creation

### 4. Developer Tools

- **Sanity Test**: Verify signature verification with simple APT transfer
- **Network Status**: Real-time block height monitoring
- **Debug Logging**: Detailed transaction and signature info

## Test Strategy

### Unit Tests (Simple)

- Import validation
- Component rendering
- Mock wallet creation

### Integration Tests (E2E)

Located in `tests/integration/`:

- **Wallet Adapter**: MetaMask integration
- **Fake Token Minting**: Complete minting flows
- **Multi-signature Support**: Both Ed25519 and SIWE paths

### UI Component Tests

Located in `tests/` (basic component tests):

- App rendering
- Import verification
- SDK availability

**Note**: Advanced component tests are in `@atomica/atomica-web-ui/tests/`

## Configuration

### Vite Config

- React plugin
- Node polyfills for browser crypto
- Tailwind CSS
- Path aliases

### Vitest Config

- Browser mode with Playwright
- Sequential test execution (testnet ports)
- Browser commands for testnet lifecycle
- Local import aliases

## Deployment

Build for production:

```bash
bun run build
```

Output in `dist/` directory, ready for static hosting.

## Environment

No environment variables required for local development. The app auto-detects:

- MetaMask presence
- Aptos testnet at `localhost:8080`
- Current network from chain ID

## Related Packages

- `@atomica/atomica-web-ui`: Component library used in this demo
- `@atomica/sdk`: Core SDK for account and transactions
- `@atomica/aptos-docker-testnet`: Local testnet infrastructure
- `@atomica/state-proof-verifier`: IBE crypto for sealed bids
