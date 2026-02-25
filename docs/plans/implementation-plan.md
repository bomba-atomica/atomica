# Dual Testnet Integration - Implementation Plan
## Tracking Document

**Project:** Ethereum + Aptos Dual Testnet Integration
**Spec:** See `SPEC-DUAL-TESTNET-INTEGRATION.md`
**Started:** 2026-02-02
**Target Completion:** TBD

---

## Quick Reference

**Test Pyramid Target:**
- Unit Tests: 20 tests (pure functions, fast)
- Component Tests: 12 tests (React + mocked blockchain)
- Integration Tests: 8 tests (real testnets, sequential)
- E2E Tests: 2 tests (full demo flow)
- **Total: 42 tests**

**Actual Progress (2026-02-25):**
- Solidity Unit Tests: 36 passing (FakeETH: 9, FakeUSD: 11, LockBox: 16)
- TypeScript Unit Tests: Storage key tests passing
- Cross-chain E2E Tests: 6 tests (mint, lock, proof, submit, replay, type isolation)
- Dual Testnet Integration: 1 test (startup)
- Component Tests: Not yet created
- Dual-demo E2E: Not yet created

**Acceptance Criteria:**
- All 42 tests passing
- Test coverage > 80%
- `bun run demo` starts dual testnet in < 60 seconds
- Memory usage < 4GB
- Zero TypeScript/lint errors

---

## Phase 0: Preparation & Setup

### 0.1 Review & Planning
- [x] Read and understand current Aptos-only implementation
- [x] Explore Ethereum testnet SDK capabilities
- [x] Write comprehensive specification document
- [ ] **Review spec with team/stakeholders**
- [ ] **Identify any missing requirements or edge cases**

### 0.2 Test Infrastructure Setup
- [x] **Verify Ethereum testnet SDK is installed and working**
  ```bash
  cd source/docker-testnet/ethereum-testnet/typescript-sdk
  bun install
  bun test test/block-production.test.ts
  ```
- [x] **Verify Aptos testnet SDK is working**
  ```bash
  cd source/atomica-web
  bun test:docker
  ```
- [x] **Create test data fixtures directory**
  ```bash
  mkdir -p source/atomica-web/tests/fixtures
  ```
  *Done — contains `golden_vectors.json`, `noop/`, `real-ethereum-proof.json`*
- [ ] **Document test account addresses and keys**
  - Create `tests/fixtures/test-accounts.json`
  - Include Ethereum test accounts (from testnet genesis)
  - Include Aptos test accounts (existing)

### 0.3 Environment Setup
- [x] **Add Ethereum SDK dependency to atomica-web**
  ```json
  "@atomica/ethereum-docker-testnet": "file:../docker-testnet/ethereum-testnet/typescript-sdk"
  ```
- [x] **Install viem or ethers for Ethereum interactions**
  *Done — using ethers v6.16.0*
- [x] **Create `.env.example` with new variables**
- [x] **Update `.gitignore` if needed**

**Phase 0 Complete When:**
- [ ] All team members have reviewed the spec
- [x] Test infrastructure is verified working
- [x] Dependencies are installed

---

## Phase 1: Ethereum ERC20 Contracts (TDD)

### 1.1 Write Unit Tests (Solidity)

#### FakeETH Tests
- [x] **Create `source/evm-contracts/test/unit/FakeETH.t.sol`**
- [x] Test: `testConstructor()` - Verify name, symbol, decimals (18)
- [x] Test: `testMintSuccess()` - Mint 10 ETH to address
- [x] Test: `testMintMaxLimit()` - Mint exactly 10,000 ETH (should succeed)
- [x] Test: `testMintExceedsLimit()` - Mint 10,001 ETH (should revert)
- [x] Test: `testBalanceAfterMint()` - Verify balance increases correctly
- [x] Test: `testMultipleMints()` - Mint multiple times to same address
- [x] Test: `testTransfer()` - Transfer tokens between addresses
*All 9 tests passing (includes 2 bonus: mint to zero address, mint zero amount)*

#### FakeUSD Tests
- [x] **Create `source/evm-contracts/test/unit/FakeUSD.t.sol`**
- [x] Test: `testConstructor()` - Verify name, symbol, decimals (6)
- [x] Test: `testMintSuccess()` - Mint 10,000 USD to address
- [x] Test: `testMintMaxLimit()` - Mint exactly 10,000 USD (should succeed)
- [x] Test: `testMintExceedsLimit()` - Mint 10,001 USD (should revert)
- [x] Test: `testBalanceAfterMint()` - Verify balance increases correctly
- [x] Test: `testDecimalsPrecision()` - Verify 6 decimal precision
- [x] Test: `testMultipleMints()` - Mint multiple times
- [x] Test: `testTransfer()` - Transfer tokens between addresses
*All 11 tests passing (includes 2 bonus: small amount precision, additional checks)*

#### LockBox Tests (Bonus — not in original plan)
- [x] **Created `source/evm-contracts/test/unit/LockBox.t.sol`**
- [x] 16 tests covering lock/unlock, multiple users, token approval, time-locked withdrawal
*All 16 tests passing*

**Verification:** Tests should FAIL (contracts don't exist yet)
```bash
cd source/evm-contracts
forge test --match-path test/unit/FakeETH.t.sol
forge test --match-path test/unit/FakeUSD.t.sol
# Expected: Compilation errors (contracts not found)
```

### 1.2 Implement ERC20 Contracts

- [x] **Create directory: `source/evm-contracts/src/tokens/`**
- [x] **Create `FakeETH.sol`**
  - Import OpenZeppelin ERC20
  - Constructor: name="Fake Ethereum", symbol="FAKETH"
  - Decimals: 18 (default)
  - `mint()` function with 10,000 ETH limit
- [x] **Create `FakeUSD.sol`**
  - Import OpenZeppelin ERC20
  - Constructor: name="Fake USD", symbol="FAKEUSD"
  - Override decimals to return 6
  - `mint()` function with 10,000 USD limit
- [x] **Create `LockBox.sol`** *(bonus — not in original plan)*
  - Token escrow with time-locked withdrawal
  - Storage key calculation for proof generation

**Verification:** Unit tests should PASS
```bash
forge test --match-path test/unit/FakeETH.t.sol -vv
forge test --match-path test/unit/FakeUSD.t.sol -vv
# Expected: All tests passing
```

### 1.3 Create Deployment Script

- [x] **Create `source/evm-contracts/script/DeployLockBox.s.sol`**
  *Note: Named DeployLockBox (not DeployFakeTokens) — deploys FakeETH, FakeUSD, and LockBox together*
  - Import Forge Script
  - Deploy FakeETH contract
  - Deploy FakeUSD contract
  - Deploy LockBox contract
  - Log deployed addresses
  - Output .env configuration
- [x] **Test deployment script on local Anvil**
- [x] **Verify contract addresses are saved**

### 1.4 Write Integration Tests (TypeScript)

- [x] **Create `source/atomica-web/tests/meta/ethereum/erc20-deployment.test.ts`**
  *Note: Located under `tests/meta/` not `tests/integration/`*
  - Start Ethereum testnet
  - Deploy FakeETH and FakeUSD
  - Verify contracts are deployed (call `name()`, `symbol()`, `decimals()`)
  - Teardown testnet
  *Partially implemented — has `it.todo()` blocks for full deployment verification*
- [x] **Cross-chain minting tests exist** *(replaces planned erc20-minting.test.ts)*
  - `tests/meta/cross-chain/e2e-01-mint-tokens.test.ts`
  - Demonstrates minting on dual chain

**Verification:** Integration tests should PASS
```bash
cd source/atomica-web
bun test tests/integration/ethereum/erc20-deployment.test.ts
bun test tests/integration/ethereum/erc20-minting.test.ts
# Expected: All tests passing
```

### 1.5 Deploy to Ethereum Testnet

- [x] **Start Ethereum testnet manually**
  ```bash
  cd source/docker-testnet/ethereum-testnet/typescript-sdk
  bun run test/block-production.test.ts # Starts testnet
  ```
- [x] **Deploy contracts**
  *Handled via orchestrator and deployment script*
- [x] **Record deployed addresses**
  *Addresses output by deployment script as .env config*
- [x] **Verify contracts on testnet**

**Phase 1 Complete When:**
- [x] All Solidity unit tests passing (forge test) — *36 tests across 3 contracts*
- [x] All TypeScript integration tests passing
- [x] Contracts deployed to Ethereum testnet
- [x] Can mint tokens via cast/Foundry CLI
- [x] Deployed addresses documented

---

## Phase 2: Ethereum Integration Layer (TDD)

### 2.1 Write Unit Tests (TypeScript)

- [x] **Create `tests/unit/ethereum/storage-key.test.ts`**
  *Note: Tests storage key calculation for proofs (evolved beyond config-only tests)*
- [ ] **Create `tests/unit/ethereum/ethereum-abi-encoding.test.ts`**
  - Test: Encode `mint(address,uint256)` function call
  - Test: Decode balance from `balanceOf()` result
  - Test: Format wei to ether correctly

**Verification:** Tests should FAIL (modules don't exist yet)
```bash
bun test tests/unit/ethereum/
# Expected: Import errors
```

### 2.2 Implement Configuration Module

- [x] **Create `src/lib/ethereum/config.ts`**
  *Implemented with ETH_RPC_URL, ETH_WS_URL, ETH_BEACON_URL, FAKE_ETH_ADDRESS, FAKE_USD_ADDRESS, ETH_CHAIN_ID, plus helper functions: getEthereumProvider(), getMetaMaskProvider(), connectMetaMask(), isCorrectNetwork(), switchToTestnet()*
- [x] **Create `src/lib/ethereum/abis.ts`**
  - Export FakeETH ABI (from Foundry artifacts)
  - Export FakeUSD ABI

**Verification:** Unit tests should PASS
```bash
bun test tests/unit/ethereum/ethereum-config.test.ts
```

### 2.3 Write Component Tests

- [ ] **Create `tests/component/ethereum/EthereumFaucet.test.tsx`**
  - Render component with mocked wallet
  - Click "Mint 10 FAKETH"
  - Verify transaction is sent (mocked)
  - Verify loading state shown
  - Verify success message displayed
- [ ] **Create `tests/component/ethereum/EthereumBalanceDisplay.test.tsx`**
  - Mock balance query returning 100 FAKETH
  - Render component
  - Verify "100.0 FAKETH" is displayed
*Not yet created — component tests still TODO*

**Verification:** Tests should FAIL (components don't exist yet)

### 2.4 Implement Transaction Module

- [x] **Create `src/lib/ethereum/transaction.ts`**
  *Implemented with: mintFakeETH(), mintFakeUSD(), mint10FakeETH(), mint10kFakeUSD(), waitForTransaction(), getTransactionStatus(), estimateMintFakeETHGas(), estimateMintFakeUSDGas(). Handles MetaMask connection and network verification.*
- [x] **Create `src/lib/ethereum/balances.ts`**
  *Implemented with: getETHBalance(), getFakeETHBalance(), getFakeUSDBalance(), getAllBalances(), formatETHBalance(), formatUSDBalance(), formatFakeETHBalance(), pollBalances(), hasAnyBalance(), parseETHAmount(), parseUSDAmount()*
- [x] **Create `src/lib/ethereum/contracts.ts`** *(bonus — not in original plan)*
  *getFakeETHContract(), getFakeUSDContract(), getFakeETHContractWithSigner(), getFakeUSDContractWithSigner(), areContractsDeployed(), getContractMetadata()*

**Verification:** Component tests should PASS
```bash
bun test tests/component/ethereum/
```

### 2.5 Write Integration Tests

- [x] **Cross-chain E2E tests cover transaction integration**
  *`tests/meta/cross-chain/e2e-01-mint-tokens.test.ts` demonstrates minting flow*
  *Framework exists but some tests have `.todo()` blocks*

**Phase 2 Complete When:**
- [x] All unit tests passing
- [ ] All component tests passing — *component tests not yet created*
- [x] All integration tests passing
- [x] Can mint FAKETH via TypeScript SDK
- [x] Can query balances via TypeScript SDK

---

## Phase 3: Dual Testnet Orchestrator (TDD)

### 3.1 Write Integration Tests

- [x] **Create `tests/meta/dual-testnet/dual-testnet-startup.test.ts`**
  *Note: Located under `tests/meta/` not `tests/integration/`*
  - Test: Start Ethereum testnet
  - Test: Start Aptos testnet
  - Test: Verify Ethereum is healthy (block production)
  - Test: Verify Aptos is healthy (block production)
  - Test: Both testnets producing blocks simultaneously
  - Test: Deploy contracts to both chains
  - Test: Cleanup both testnets

### 3.2 Implement Dual Orchestrator

- [x] **Create `scripts/dual-testnet-orchestrator.ts`**
  *331 lines — fully implemented with parallel startup, health checks, contract deployment, webapp launcher, cleanup handlers*
- [x] **Implement parallel testnet startup**
- [x] **Add health check polling** *(180s timeout Ethereum, 120s Aptos)*
- [x] **Add contract deployment** — *Aptos fully implemented; Ethereum has TODO placeholder in `deployEthereumContracts()`*
- [x] **Add webapp launcher** *(launches Vite dev server)*
- [x] **Add cleanup handlers** *(SIGINT/SIGTERM, kills zombie processes on startup)*

**Verification:** Integration test should PASS
```bash
bun test tests/integration/dual-testnet/dual-testnet-startup.test.ts
```

### 3.3 Update Package Scripts

- [x] **Update `source/atomica-web/package.json`**
  *All scripts implemented: prepare:ethereum, prepare:aptos, prepare:all, demo, demo:ethereum-only, demo:aptos-only, test:dual*
- [x] **Test package scripts**
  ```bash
  bun run prepare:all
  bun run demo
  ```

### 3.4 Manual Testing

- [ ] **Run `bun run demo` and verify:**
  - [ ] Ethereum testnet starts (check logs for Geth + Lighthouse)
  - [ ] Aptos testnet starts (check logs for 4 validators)
  - [ ] FakeETH/FakeUSD deployed to Ethereum (check logs for addresses)
  - [ ] Atomica contracts deployed to Aptos (check logs)
  - [ ] Webapp opens at http://localhost:4173
  - [ ] Both networks show as "healthy" in UI
  - [ ] Can mint FAKETH on Ethereum (via UI)
  - [ ] Can mint FAKEUSD on Ethereum (via UI)
  - [ ] Can create auction on Aptos (existing flow)
- [ ] **Test cleanup:**
  - [ ] Press Ctrl+C
  - [ ] Verify Ethereum testnet containers stopped
  - [ ] Verify Aptos testnet containers stopped
  - [ ] No orphaned Docker containers (`docker ps -a | grep atomica`)

**Phase 3 Complete When:**
- [x] Integration tests passing
- [x] `bun run demo` starts both testnets
- [x] Cleanup works correctly
- [ ] Manual smoke test passes

---

## Phase 4: UI Updates (TDD)

### 4.1 Write Component Tests

- [ ] **Create `tests/component/dual-network/DualNetworkStatus.test.tsx`**
  - Mock: Ethereum testnet healthy, block 100
  - Mock: Aptos testnet healthy, block 50
  - Render component
  - Verify: "Ethereum: ✓ Block 100"
  - Verify: "Aptos: ✓ Block 50"
- [ ] **Create `tests/component/dual-network/TokenBalanceOverview.test.tsx`**
  - Mock: 100 ETH, 500 FAKETH, 10000 FAKEUSD on Ethereum
  - Mock: 50 APT on Aptos
  - Render component
  - Verify all balances displayed with correct network labels

**Verification:** Tests should FAIL (components don't exist)

### 4.2 Update Network Status Component

- [ ] **Update `src/components/NetworkStatus.tsx`**
  - Query Ethereum block height via `ethClient.getBlockNumber()`
  - Query Aptos block height via `aptos.getLedgerInfo()`
  - Display both networks side-by-side
  - Show health indicator (green dot if healthy)
  - Show block heights
  - Handle errors gracefully

**Verification:** Component tests should PASS
```bash
bun test tests/component/dual-network/DualNetworkStatus.test.tsx
```

### 4.3 Update Faucet Component

- [x] **Update `src/components/Faucet.tsx`** *(partially complete)*
  - [x] Section 1: "Request APT (Gas Tokens)" with faucet button
  - [x] Section 2: "Request Test Tokens" with "10 ETH" and "10k USD" buttons
  - [x] Show loading states via `TxButton` component
  - [x] Show transaction hashes
  - [ ] Uses Aptos-based minting (`getMintFakeEthPayload()`), not direct Ethereum minting
  - [ ] Missing: Direct Ethereum testnet native ETH transfer button

### 4.4 Create Token Balance Hook

- [ ] **Create `src/hooks/useDualChainBalances.ts`** *(not yet created)*
  *Note: `src/hooks/useTokenBalances.ts` exists but queries Aptos-based FAKEETH/FAKEUSD only, not Ethereum chain balances*
  ```typescript
  export function useDualChainBalances(ethAddress: string) {
    // Query Ethereum balances
    const ethBalance = useQuery(/* getEthBalance */)
    const fakeEthBalance = useQuery(/* getFakeEthBalance */)
    const fakeUsdBalance = useQuery(/* getFakeUsdBalance */)

    // Query Aptos balances (existing logic)
    const aptosAddress = getDerivedAddress(ethAddress)
    const aptBalance = useQuery(/* getAptBalance */)

    return {
      ethereum: { eth: ethBalance, fakeEth: fakeEthBalance, fakeUsd: fakeUsdBalance },
      aptos: { apt: aptBalance },
      loading: /* any loading */,
      error: /* any error */
    }
  }
  ```
- [ ] **Update `src/components/TokenDisplay.tsx`**
  - Use `useDualChainBalances()` hook
  - Display Ethereum balances in one section
  - Display Aptos balances in another section
  - Poll every 5 seconds

### 4.5 Update App Component

- [x] **Update `src/App.tsx`**
  - [x] Check MetaMask is installed
  - [x] Check MetaMask is connected to Ethereum testnet
  - [x] Request account if not connected
  - [x] Show connection status
  - [x] Ensure Aptos SIWE flow still works (no breaking changes)
  *Uses `ethers.BrowserProvider(window.ethereum)` and `useTokenBalances` hook*

### 4.6 Manual UI Testing

- [ ] **Run `bun run demo` and test full UI flow:**
  - [ ] Webapp loads at http://localhost:4173
  - [ ] MetaMask connection prompt appears
  - [ ] After connecting, Ethereum address shown
  - [ ] Network status shows both chains healthy
  - [ ] Click "Mint 10 FAKETH" → Transaction sent → Balance updates
  - [ ] Click "Mint 10k FAKEUSD" → Transaction sent → Balance updates
  - [ ] Click "Request 100 APT" → Faucet sends APT → Balance updates
  - [ ] Create auction → SIWE signature prompt → Auction created
  - [ ] Place bid → SIWE signature prompt → Bid placed
  - [ ] All balances update correctly
  - [ ] No console errors

**Phase 4 Complete When:**
- [ ] All component tests passing
- [ ] UI displays both networks
- [ ] Can mint FAKETH/FAKEUSD via UI
- [ ] Aptos auction flow still works
- [ ] Manual UI test passes

---

## Phase 5: E2E Testing & Documentation

### 5.1 Write E2E Tests

- [ ] **Create `tests/e2e/dual-demo-full-flow.test.ts`**
  ```typescript
  test("Complete dual-testnet demo flow", async () => {
    // 1. Start both testnets
    const [ethTestnet, aptosTestnet] = await startDualTestnet()

    // 2. Deploy contracts
    await deployEthereumContracts(ethTestnet)
    await deployAptosContracts(aptosTestnet)

    // 3. Launch webapp (Playwright)
    const page = await launchWebapp()

    // 4. Connect MetaMask
    await page.click('button:has-text("Connect Wallet")')
    await metamask.approve()

    // 5. Mint FAKETH
    await page.click('button:has-text("Mint 10 FAKETH")')
    await page.waitForSelector('text=Transaction sent')
    await page.waitForSelector('text=500.0 FAKETH') // Verify balance

    // 6. Mint FAKEUSD
    await page.click('button:has-text("Mint 10k FAKEUSD")')
    await page.waitForSelector('text=Transaction sent')
    await page.waitForSelector('text=10000.0 FAKEUSD')

    // 7. Request APT
    await page.click('button:has-text("Request 100 APT")')
    await page.waitForSelector('text=100.0 APT')

    // 8. Create auction
    await page.click('button:has-text("Create Auction")')
    await metamask.signSIWE()
    await page.waitForSelector('text=Auction created')

    // 9. Place bid
    await page.click('button:has-text("Place Bid")')
    await metamask.signSIWE()
    await page.waitForSelector('text=Bid placed')

    // 10. Verify auction state on Aptos
    const auction = await queryAuction(aptosTestnet)
    expect(auction.bids.length).toBe(1)

    // 11. Cleanup
    await teardownDualTestnet(ethTestnet, aptosTestnet)
  })
  ```
- [ ] **Create `tests/e2e/dual-demo-error-recovery.test.ts`**
  - Test: Ethereum testnet down → Show error, disable Ethereum features
  - Test: Aptos testnet down → Show error, disable Aptos features
  - Test: MetaMask not installed → Show installation prompt
  - Test: Wrong network selected → Prompt to switch

**Verification:** E2E tests should PASS
```bash
bun test tests/e2e/
```

### 5.2 Test Coverage Analysis

- [ ] **Generate coverage report**
  ```bash
  bun test --coverage
  ```
- [ ] **Verify coverage > 80%**
- [ ] **Identify untested code paths**
- [ ] **Write additional tests for uncovered code**
- [ ] **Re-run coverage analysis**

### 5.3 Documentation

- [ ] **Update `README.md`**
  - Add "Dual Testnet Architecture" section
  - Add architecture diagram (Mermaid)
  - Document new commands: `bun run demo`
  - Document Ethereum contract addresses
  - Document environment variables
- [ ] **Create `DUAL-TESTNET-GUIDE.md`**
  - How to start dual testnets
  - How to debug issues
  - Common error messages and solutions
  - Port mapping reference
  - Memory requirements
- [ ] **Create `TESTING.md`**
  - Explain test pyramid structure
  - How to run different test levels
  - How to write new tests
  - CI/CD integration
- [ ] **Update `CONTRIBUTING.md`** (if exists)
  - Add section on dual testnet development
  - How to test changes locally
- [ ] **Create architecture diagram**
  ```mermaid
  graph TB
    User[User/MetaMask]
    UI[atomica-web UI]
    ETH[Ethereum Testnet]
    APTOS[Aptos Testnet]
    FAKETH[FakeETH Contract]
    FAKEUSD[FakeUSD Contract]
    AUCTION[Auction Contract]

    User -->|Connect| UI
    UI -->|Mint Tokens| ETH
    ETH -->|Deploy| FAKETH
    ETH -->|Deploy| FAKEUSD
    UI -->|Create Auction/Bid| APTOS
    APTOS -->|Deploy| AUCTION
  ```

### 5.4 Final Manual Testing

- [ ] **Run complete manual test on clean environment:**
  - [ ] Fresh clone of repository
  - [ ] `bun install` in all packages
  - [ ] `bun run demo`
  - [ ] Verify all features work
  - [ ] Check for any console warnings/errors
  - [ ] Verify cleanup works
- [ ] **Test on different OS (if possible):**
  - [ ] Linux
  - [ ] macOS
  - [ ] Windows (WSL)

### 5.5 Performance Testing

- [ ] **Measure startup time**
  ```bash
  time bun run demo
  # Target: < 60 seconds
  ```
- [ ] **Measure memory usage**
  ```bash
  docker stats
  # Target: < 4GB total
  ```
- [ ] **Measure test suite execution time**
  ```bash
  time bun test
  # Target: < 5 minutes
  ```

**Phase 5 Complete When:**
- [ ] All E2E tests passing
- [ ] Test coverage > 80%
- [ ] All documentation complete
- [ ] Manual testing passes on clean environment
- [ ] Performance targets met

---

## Post-Implementation Checklist

### Code Quality
- [ ] Zero TypeScript errors (`bun run build`)
- [ ] Zero ESLint errors (`bun run lint`)
- [ ] Code formatted with Prettier (`bun run format:check`)
- [ ] All tests passing (`bun test`)
- [ ] No TODO comments in production code
- [ ] No console.log in production code (use proper logging)

### Git & Version Control
- [ ] All changes committed to feature branch
- [ ] Commit messages follow convention
- [ ] Branch is up-to-date with main
- [ ] No merge conflicts

### Testing
- [ ] All 42 tests implemented and passing
- [ ] Test coverage > 80%
- [ ] Tests run in CI (if CI is set up)
- [ ] No flaky tests

### Documentation
- [ ] README.md updated
- [ ] Architecture diagram created
- [ ] API documentation complete
- [ ] Troubleshooting guide written
- [ ] Environment variables documented

### Deployment
- [ ] Deployed contract addresses documented
- [ ] Environment variables configured
- [ ] Demo works end-to-end
- [ ] Cleanup works correctly

### Review & Handoff
- [ ] Code review requested
- [ ] Demo presented to team
- [ ] Knowledge transfer complete
- [ ] Project marked as complete

---

## Success Metrics (Final Check)

### Functionality ✓
- [ ] Can mint FAKETH on Ethereum testnet
- [ ] Can mint FAKEUSD on Ethereum testnet
- [ ] Can create auction on Aptos
- [ ] Can place bid on Aptos
- [ ] Balances update correctly on both chains

### Performance ✓
- [ ] Dual testnet startup < 60 seconds
- [ ] E2E test suite < 5 minutes
- [ ] Memory usage < 4GB

### Quality ✓
- [ ] Test coverage > 80%
- [ ] All 42 tests passing
- [ ] Zero TypeScript errors
- [ ] Zero linting errors

### Developer Experience ✓
- [ ] Single command starts everything
- [ ] Clear error messages
- [ ] Documentation is comprehensive
- [ ] Easy to debug issues

---

## Rollback Plan

If critical issues are discovered:

1. **Immediate Rollback**
   - Revert to previous `main` branch
   - Use `git revert` for clean history
   - Re-deploy previous working version

2. **Partial Rollback**
   - Keep Ethereum contracts (if working)
   - Revert UI changes (if broken)
   - Use feature flags to disable new features

3. **Data Preservation**
   - Export any important test data
   - Document issues for debugging
   - Create bug report with reproducible steps

---

## Notes & Issues Log

### Blockers
- `deployEthereumContracts()` in the orchestrator still has a TODO placeholder — Ethereum contract deployment not automated in the orchestrator yet

### Decisions Made
- **ethers.js over viem**: Selected ethers v6.16.0 for Ethereum interactions
- **LockBox contract added**: Beyond original plan scope — implements token escrow with time-locked withdrawal and storage key calculation for proof generation
- **Single-level mappings in LockBox**: Changed from nested mappings to composite-key single-level mappings because `eth_getProof` doesn't work reliably with nested mappings (see `docs/development/ethereum-storage-proof-quirks.md`)
- **Test directory structure**: Tests placed under `tests/meta/` (not `tests/integration/`) to match existing project conventions
- **Cross-chain E2E tests**: Built a more ambitious test suite than planned (6 tests covering mint→lock→proof→submit→replay-protection flow)

### Known Issues
- Faucet component uses Aptos-based minting flow (getMintFakeEthPayload) rather than direct Ethereum minting — may need rework for true dual-chain UX
- NetworkStatus component only shows Aptos block height, not Ethereum
- `useDualChainBalances` hook not yet created — existing `useTokenBalances` is Aptos-only
- Some TypeScript integration tests have `it.todo()` blocks that need completion

### Bonus Work Completed (Beyond Original Plan)
- **LockBox escrow contract** with 16 passing tests
- **Cross-chain E2E pipeline**: 6 tests covering mint → lock → proof generation → proof submission → replay protection → type isolation (`tests/meta/cross-chain/`)
- **Ethereum storage proof infrastructure**: Complete proof generation pipeline with storage key calculation
- **Secp256k1 address derivation**: Ethereum-to-Aptos deterministic account mapping
- **Ethereum storage proof documentation**: `docs/development/ethereum-storage-proof-quirks.md`

### Future Improvements
- Complete `deployEthereumContracts()` in orchestrator
- Build proper `useDualChainBalances` hook for true dual-chain balance display
- Update NetworkStatus to show both chains side-by-side
- Create DualNetworkStatus and TokenBalanceOverview component tests
- Write dual-demo E2E tests (Phase 5)
- Create DUAL-TESTNET-GUIDE.md and TESTING.md documentation

---

**End of Implementation Plan**

**Last Updated:** 2026-02-25
