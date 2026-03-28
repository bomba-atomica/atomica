# Dual Testnet Integration: Ethereum + Aptos
## Project Specification v1.0

**Date:** 2026-02-02
**Status:** Reference Planning Spec (baseline implementation now exists)
**Approach:** Test-Driven Development (TDD)

> [!NOTE]
> This document captures the original planning specification and architecture intent.
> For current roadmap/progress, use `docs/plans/implementation-plan.md`.
> For current cross-chain suite structure/usage, use `docs/development/cross-chain-test-suite.md`.

---

## Executive Summary

Migrate FAKETH and FAKEUSD token minting from Aptos to Ethereum testnet while maintaining Aptos testnet for auction functionality. This creates a dual-testnet architecture where:

- **Ethereum Testnet:** Hosts ERC20 tokens (FakeETH, FakeUSD) and the LockBox escrow contract. Users mint and lock tokens here.
- **Aptos Testnet:** Hosts auction contracts, IBE/DKG infrastructure, and cross-chain verification modules. Lock receipts are verified and consumed on Aptos for auction/settlement logic. FakeETH/FakeUSD are **not minted on Aptos** in the canonical test architecture.

This architecture simulates the production cross-chain environment where real assets (ETH, USDC) exist on Ethereum while auction logic runs on Aptos.

> **Canonical token policy (2026-03-02):** FakeETH and FakeUSD are minted **only on the EVM testnet**.  
> Any Aptos-side fake coin minting path (direct `fake_eth::mint()` / `fake_usd::mint()` or bridged fake-coin minting) is legacy prototype behavior and is **deprecated in specifications**.  
> The Aptos faucet is APT-gas-only.

---

## Previous Architecture (Superseded)

### Token Flow (Old — deprecated prototype, no longer used)
```
User → Aptos Testnet → Direct fake-token minting (deprecated)
     ↓
     Aptos Auction Contracts
```

### Components
1. **Aptos contracts (legacy prototype)**
   - Included direct fake-token minting paths on Aptos (deprecated and removed from canonical test flow)
   - `registry.move` - Auction registry
   - Location: `source/atomica-move-contracts/sources/`

2. **atomica-web Demo**
   - Entry: `bun run demo` → `scripts/orchestrator.ts`
   - Starts Aptos testnet (4 validators)
   - Deploys Move contracts
   - Serves React UI on http://localhost:4173
   - SIWE authentication for Ethereum wallets on Aptos

3. **Testnet Infrastructure**
   - Aptos Docker Testnet SDK: `@atomica/docker-testnet`
   - 4 validators, faucet on port 8081
   - REST API on port 8080

---

## Target Architecture

### Token Flow (Current — implemented)
```
User → MetaMask → Ethereum Testnet → Mint FakeETH/FakeUSD (ERC20)
                        ↓
                   Lock in LockBox.sol
                        ↓
                   Generate state proof (eth_getProof)
                        ↓
                   Submit proof to Aptos (lock_receipt::register_ethereum_lock)
                        ↓
                   Register/consume lock receipt on Aptos
                        ↓
                   Aptos Auction Contracts
```

### New Components Required

#### 1. Ethereum ERC20 Contracts
**Location:** `source/evm-contracts/src/FakeTokens.sol`

```solidity
// FAKETH - 18 decimals (matches real ETH)
contract FakeETH is ERC20 {
    constructor() ERC20("Fake Ethereum", "FAKETH") {}

    function mint(address to, uint256 amount) external {
        require(amount <= 10_000 ether, "Max 10,000 FAKETH per mint");
        _mint(to, amount);
    }
}

// FAKEUSD - 6 decimals (matches real USDC)
contract FakeUSD is ERC20 {
    constructor() ERC20("Fake USD", "FAKEUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        require(amount <= 10_000_000_000, "Max 10,000 FAKEUSD per mint");
        _mint(to, amount);
    }
}
```

#### 2. Dual Testnet Orchestrator
**Location:** `source/atomica-web/scripts/dual-testnet-orchestrator.ts`

**Responsibilities:**
- Start Ethereum testnet (Geth + Lighthouse)
- Start Aptos testnet (4 validators)
- Deploy ERC20 contracts to Ethereum
- Deploy Move contracts to Aptos
- Wait for both networks to be healthy
- Launch webapp

#### 3. Ethereum Integration Layer
**Location:** `source/atomica-web/src/lib/ethereum/`

**Files:**
- `config.ts` - RPC URLs, contract addresses
- `contracts.ts` - Contract ABIs and instances
- `transaction.ts` - Send transactions via MetaMask
- `balances.ts` - Query ERC20 balances

#### 4. Updated UI Components
**Modifications:**
- `src/components/Faucet.tsx` - Add Ethereum token minting buttons
- `src/hooks/useTokenBalances.ts` - Query both Aptos and Ethereum
- `src/App.tsx` - Show both network statuses

---

## Testing Pyramid (TDD Approach)

```
                    ┌─────────────┐
                    │   E2E (2)   │  Full demo flow
                    └─────────────┘
                   ┌───────────────┐
                   │ Integration   │  Cross-chain flows
                   │     (8)       │
                   └───────────────┘
                ┌────────────────────┐
                │   Component (12)   │  React + blockchain
                └────────────────────┘
            ┌──────────────────────────┐
            │      Unit (20)           │  Pure functions
            └──────────────────────────┘
```

### Test Categories

#### Level 1: Unit Tests (20 tests)
**Location:** `source/atomica-web/tests/unit/`

**Ethereum Utils:**
1. `ethereum-address-validation.test.ts` - Validate ETH addresses
2. `ethereum-balance-formatting.test.ts` - Format wei/gwei/ether
3. `erc20-abi-encoding.test.ts` - Encode function calls

**Dual Network:**
4. `network-detector.test.ts` - Detect active networks
5. `multi-chain-balance-aggregator.test.ts` - Combine balances from both chains

#### Level 2: Component Tests (12 tests)
**Location:** `source/atomica-web/tests/component/`

**Ethereum Components:**
1. `EthereumFaucet.test.tsx` - Mint FAKETH/FAKEUSD
2. `EthereumBalanceDisplay.test.tsx` - Show ETH balances
3. `NetworkSwitcher.test.tsx` - Switch between networks

**Dual Network:**
4. `DualNetworkStatus.test.tsx` - Show both network health
5. `TokenBalanceOverview.test.tsx` - Display tokens from both chains

#### Level 3: Integration Tests (8 tests)
**Location:** `source/atomica-web/tests/integration/`

**Ethereum Testnet:**
1. `ethereum-testnet-startup.test.ts` - Start Ethereum testnet
2. `erc20-deployment.test.ts` - Deploy FAKETH/FAKEUSD
3. `erc20-minting.test.ts` - Mint tokens to address
4. `erc20-balance-query.test.ts` - Query balances

**Dual Testnet:**
5. `dual-testnet-startup.test.ts` - Start both testnets in parallel
6. `dual-testnet-contract-deployment.test.ts` - Deploy to both chains
7. `cross-chain-balance-sync.test.ts` - Verify balances on both chains
8. `dual-testnet-teardown.test.ts` - Clean shutdown of both

#### Level 4: E2E Tests (2 tests)
**Location:** `source/atomica-web/tests/e2e/`

1. `dual-demo-full-flow.test.ts` - Complete demo: start testnets → deploy contracts → mint tokens → create auction → place bid
2. `dual-demo-error-recovery.test.ts` - Handle network failures gracefully

---

## Implementation Phases

### Phase 0: Preparation (Setup & Planning)
**Deliverable:** Test infrastructure ready

- [x] Understand current Aptos-only architecture
- [x] Understand Ethereum testnet SDK
- [x] Write this specification document
- [ ] Review specification with stakeholders
- [ ] Set up test data fixtures

### Phase 1: Ethereum Contracts (TDD)
**Deliverable:** ERC20 tokens on Ethereum testnet

#### Tests First
- [ ] Write unit test: `FakeETH.t.sol` - Test minting, max limits, decimals
- [ ] Write unit test: `FakeUSD.t.sol` - Test minting, 6 decimals, max limits
- [ ] Write integration test: `erc20-deployment.test.ts` - Deploy to testnet
- [ ] Write integration test: `erc20-minting.test.ts` - Mint via SDK

#### Implementation
- [ ] Create `source/evm-contracts/src/tokens/FakeETH.sol`
- [ ] Create `source/evm-contracts/src/tokens/FakeUSD.sol`
- [ ] Add deployment script: `source/evm-contracts/src/script/DeployFakeTokens.s.sol`
- [ ] Run tests: `forge test --match-path test/unit/FakeETH.t.sol`
- [ ] Run tests: `forge test --match-path test/unit/FakeUSD.t.sol`
- [ ] Deploy to Ethereum testnet and verify

#### Acceptance Criteria
- [ ] `forge test` passes all token tests
- [ ] `bun test tests/integration/erc20-*` passes
- [ ] Contracts deployed to Ethereum testnet
- [ ] Can mint 10 FAKETH via Foundry script
- [ ] Can mint 10,000 FAKEUSD via Foundry script

### Phase 2: Ethereum Integration Layer (TDD)
**Deliverable:** atomica-web can interact with Ethereum testnet

#### Tests First
- [ ] Write unit test: `ethereum-config.test.ts` - Validate RPC URLs
- [ ] Write unit test: `ethereum-contract-interface.test.ts` - Test ABI encoding
- [ ] Write component test: `EthereumFaucet.test.tsx` - Mock minting flow
- [ ] Write integration test: `ethereum-transaction.test.ts` - Send real transaction

#### Implementation
- [ ] Create `source/atomica-web/src/lib/ethereum/config.ts`
  - Export `ETH_RPC_URL = "http://localhost:8545"`
  - Export contract addresses (set after deployment)
- [ ] Create `source/atomica-web/src/lib/ethereum/contracts.ts`
  - Export FakeETH/FakeUSD ABIs
  - Export contract instances (viem or ethers)
- [ ] Create `source/atomica-web/src/lib/ethereum/transaction.ts`
  - `mintFakeEth(amount: bigint)`
  - `mintFakeUsd(amount: bigint)`
  - Use MetaMask via `window.ethereum`
- [ ] Create `source/atomica-web/src/lib/ethereum/balances.ts`
  - `getEthBalance(address: string)`
  - `getFakeEthBalance(address: string)`
  - `getFakeUsdBalance(address: string)`

#### Acceptance Criteria
- [ ] Unit tests pass: `bun test tests/unit/ethereum-*`
- [ ] Integration tests pass: `bun test tests/integration/ethereum-*`
- [ ] Can query balances from Ethereum testnet
- [ ] Can send mint transaction via MetaMask

### Phase 3: Dual Testnet Orchestrator (TDD)
**Deliverable:** Single command starts both testnets

#### Tests First
- [ ] Write integration test: `dual-testnet-startup.test.ts`
  - Start Ethereum testnet
  - Start Aptos testnet
  - Verify both healthy
  - Deploy contracts to both
- [ ] Write integration test: `dual-testnet-teardown.test.ts`
  - Clean shutdown without orphaned containers

#### Implementation
- [ ] Create `source/atomica-web/scripts/dual-testnet-orchestrator.ts`
  - Import `EthereumDockerTestnet` from `@atomica/ethereum-docker-testnet`
  - Import `DockerTestnet` from `@atomica/docker-testnet`
  - Start Ethereum testnet (8 validators)
  - Start Aptos testnet (4 validators)
  - Wait for both networks to produce blocks
  - Deploy ERC20 contracts to Ethereum
  - Deploy Move contracts to Aptos
  - Launch webapp
  - Register cleanup handlers for both testnets
- [ ] Update `package.json`
  - Change `"demo"` script to use dual orchestrator
  - `"demo": "bun run prepare:all && npx tsx scripts/dual-testnet-orchestrator.ts"`
  - Add `"prepare:all"` to build both SDKs

#### Acceptance Criteria
- [ ] `bun run demo` starts both testnets
- [ ] Ethereum testnet running on http://localhost:8545
- [ ] Aptos testnet running on http://localhost:8080
- [ ] Contracts deployed to both chains
- [ ] Webapp shows both networks as "healthy"
- [ ] Ctrl+C cleanly tears down both testnets

### Phase 4: UI Updates (TDD)
**Deliverable:** UI supports both Ethereum and Aptos

#### Tests First
- [ ] Write component test: `DualNetworkStatus.test.tsx` - Show both networks
- [ ] Write component test: `EthereumFaucet.test.tsx` - Mint from Ethereum
- [ ] Write component test: `TokenBalanceOverview.test.tsx` - Display all balances
- [ ] Write E2E test: `dual-demo-full-flow.test.ts` - Complete user journey

#### Implementation
- [ ] Update `src/components/NetworkStatus.tsx`
  - Show Ethereum testnet status (Geth + Lighthouse)
  - Show Aptos testnet status (validators)
  - Display block heights for both
- [ ] Update `src/components/Faucet.tsx`
  - Section 1: "Get Test ETH" - Request from Ethereum testnet
  - Section 2: "Mint FAKETH/FAKEUSD" - Call Ethereum contracts
  - Section 3: "Get APT" - Request from Aptos faucet (existing)
- [ ] Update `src/hooks/useTokenBalances.ts`
  - Query Ethereum balances (ETH, FAKETH, FAKEUSD)
  - Query Aptos balances (APT)
  - Return combined state
- [ ] Update `src/components/TokenDisplay.tsx`
  - Show Ethereum token balances
  - Show Aptos balances
  - Display network for each token
- [ ] Update `src/App.tsx`
  - Check MetaMask connected to Ethereum testnet
  - Ensure SIWE still works for Aptos transactions

#### Acceptance Criteria
- [ ] Component tests pass: `bun test tests/component/`
- [ ] UI shows "Ethereum Testnet" and "Aptos Testnet" status
- [ ] Can mint FAKETH on Ethereum via UI
- [ ] Can mint FAKEUSD on Ethereum via UI
- [ ] Token balances update after minting
- [ ] Aptos auction flow still works

### Phase 5: E2E Testing & Documentation
**Deliverable:** Production-ready demo with full test coverage

#### Tests
- [ ] Write E2E test: `dual-demo-full-flow.test.ts`
  1. Start both testnets
  2. Deploy all contracts
  3. Connect MetaMask
  4. Mint FAKETH on Ethereum
  5. Mint FAKEUSD on Ethereum
  6. Request APT on Aptos
  7. Create auction on Aptos (using FAKETH)
  8. Place bid on Aptos (using FAKEUSD)
  9. Verify auction state
  10. Teardown
- [ ] Write E2E test: `dual-demo-error-recovery.test.ts`
  - Ethereum testnet down → graceful error
  - Aptos testnet down → graceful error
  - MetaMask not connected → prompt user

#### Documentation
- [ ] Update `README.md` with dual testnet architecture
- [ ] Document Ethereum contract addresses
- [ ] Document new environment variables
- [ ] Add troubleshooting section for dual testnets
- [ ] Create architecture diagram (Mermaid)

#### Acceptance Criteria
- [ ] All E2E tests pass: `bun test tests/e2e/`
- [ ] Test coverage > 80% for new code
- [ ] Demo runs end-to-end without errors
- [ ] Documentation is complete and accurate

---

## Technical Decisions

### 1. Token Decimals
- **FAKETH:** 18 decimals (matches real ETH standard)
- **FAKEUSD:** 6 decimals (matches real USDC)
- **Rationale:** Simulate production environment accurately

### 2. Ethereum Testnet Configuration
- **Validators:** 8 (4 more than Aptos for redundancy)
- **Consensus:** Proof-of-Stake (Lighthouse + Geth)
- **Block Time:** 12 seconds (Ethereum standard)
- **Why:** Production-like environment

### 3. Contract Deployment
- **Ethereum:** Use Foundry scripts (`forge script`)
- **Aptos:** Use existing `DockerTestnet.deployContracts()`
- **Sequential:** Deploy Ethereum first, then Aptos (contracts independent)

### 4. MetaMask Integration
- **Ethereum transactions:** Direct via MetaMask
- **Aptos transactions:** Continue using SIWE (existing flow)
- **Why:** No changes to Aptos auth flow, only add Ethereum support

### 5. Test Execution
- **Unit/Component:** Run in parallel (vitest default)
- **Integration (Ethereum):** Run in parallel (different ports)
- **Integration (Aptos):** Sequential (port conflicts on 8080/8081)
- **E2E:** Sequential (resource intensive)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Both testnets consume too much memory | High | Use smaller validator counts in CI |
| Port conflicts between testnets | Medium | Ethereum: 8545, Aptos: 8080 (different) |
| Slow testnet startup | Medium | Cache Docker images, parallel startup |
| ERC20 contracts have bugs | High | Thorough unit testing before integration |
| MetaMask connection fails | Medium | Provide clear user instructions |
| SIWE breaks with new changes | High | Maintain existing Aptos tests |

---

## Success Metrics

1. **Functionality**
   - [ ] Can mint FAKETH on Ethereum testnet
   - [ ] Can mint FAKEUSD on Ethereum testnet
   - [ ] Can create auction on Aptos with FAKETH reference
   - [ ] Can place bid on Aptos with FAKEUSD reference

2. **Performance**
   - [ ] Dual testnet startup < 60 seconds
   - [ ] E2E test suite completes < 5 minutes
   - [ ] Memory usage < 4GB for both testnets

3. **Quality**
   - [ ] Test coverage > 80%
   - [ ] All tests passing on CI
   - [ ] Zero TypeScript errors
   - [ ] Zero linting errors

4. **Developer Experience**
   - [ ] Single command (`bun run demo`) starts everything
   - [ ] Clear error messages if testnets fail
   - [ ] Documentation is comprehensive

---

## Future Enhancements (Out of Scope)

1. **Cross-Chain Receipt Settlement**
   - Lock FAKETH/FAKEUSD on Ethereum
   - Register and consume lock receipts on Aptos
   - No Aptos fake-coin minting in canonical flow

2. **Real Asset Support**
   - Replace FAKETH with real Ethereum Sepolia
   - Replace FAKEUSD with Circle USDC testnet
   - Requires testnet faucets and token contracts

3. **Multi-Chain Auction**
   - Create auction on Aptos
   - Settle on Ethereum using ZK proofs
   - Cross-chain message passing

---

## Appendix A: File Structure

```
atomica/
├── source/
│   ├── evm-contracts/
│   │   ├── src/
│   │   │   ├── tokens/
│   │   │   │   ├── FakeETH.sol          [NEW]
│   │   │   │   └── FakeUSD.sol          [NEW]
│   │   │   └── script/
│   │   │       └── DeployFakeTokens.s.sol [NEW]
│   │   └── test/
│   │       ├── unit/
│   │       │   ├── FakeETH.t.sol        [NEW]
│   │       │   └── FakeUSD.t.sol        [NEW]
│   │       └── integration/
│   │           └── ERC20Deployment.t.sol [NEW]
│   ├── atomica-web/
│   │   ├── scripts/
│   │   │   └── dual-testnet-orchestrator.ts [NEW]
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   └── ethereum/             [NEW]
│   │   │   │       ├── config.ts
│   │   │   │       ├── contracts.ts
│   │   │   │       ├── transaction.ts
│   │   │   │       └── balances.ts
│   │   │   └── components/
│   │   │       ├── NetworkStatus.tsx     [MODIFIED]
│   │   │       ├── Faucet.tsx            [MODIFIED]
│   │   │       └── TokenDisplay.tsx      [MODIFIED]
│   │   └── tests/
│   │       ├── unit/
│   │       │   └── ethereum-*.test.ts    [NEW]
│   │       ├── component/
│   │       │   └── Ethereum*.test.tsx    [NEW]
│   │       ├── integration/
│   │       │   ├── ethereum-*.test.ts    [NEW]
│   │       │   └── dual-testnet-*.test.ts [NEW]
│   │       └── e2e/
│   │           └── dual-demo-*.test.ts   [NEW]
│   └── docker-testnet/
│       └── ethereum-testnet/             [EXISTS]
│           └── typescript-sdk/
└── SPEC-DUAL-TESTNET-INTEGRATION.md      [THIS FILE]
```

---

## Appendix B: Environment Variables

```bash
# Ethereum Testnet
ETH_RPC_URL=http://localhost:8545
ETH_WS_URL=ws://localhost:8546
ETH_BEACON_URL=http://localhost:5052
FAKE_ETH_CONTRACT_ADDRESS=<deployed-address>
FAKE_USD_CONTRACT_ADDRESS=<deployed-address>

# Aptos Testnet (existing)
APTOS_NODE_URL=http://127.0.0.1:8080/v1
APTOS_FAUCET_URL=http://127.0.0.1:8081
VITE_CONTRACT_ADDRESS=0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa

# Demo Configuration
DEMO_AUTO_START=true
DEMO_ETH_VALIDATORS=8
DEMO_APTOS_VALIDATORS=4
```

---

## Appendix C: Commands Reference

```bash
# Start dual testnet demo
bun run demo

# Run all tests
bun test

# Run specific test levels
bun test:unit
bun test:component
bun test:integration
bun test:e2e

# Build and deploy Ethereum contracts only
cd source/evm-contracts
forge build
forge script script/DeployFakeTokens.s.sol --rpc-url http://localhost:8545 --broadcast

# Start Ethereum testnet only
cd source/docker-testnet/ethereum-testnet/typescript-sdk
bun test test/block-production.test.ts

# Start Aptos testnet only (existing)
cd source/atomica-web
bun run test:docker
```

---

**End of Specification**
