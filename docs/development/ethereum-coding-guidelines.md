# Ethereum Coding Guidelines

## Definition of Done

**CRITICAL**: A task is NOT complete until ALL criteria are met.

### Preflight Checklist

- [ ] **Tests written FIRST** (TDD)
- [ ] **All tests pass** - Unit, fuzz, symbolic, and formal
- [ ] **Zero compiler warnings** - `forge build` clean
- [ ] **Halmos passes** - All `check_` functions verified
- [ ] **Kontrol proves invariants** - Required for all contracts
- [ ] **E2E tests pass** - Docker testnet integration
- [ ] **NatSpec complete** - All public functions documented
- [ ] **Security checklist reviewed**

**If ANY item fails, the work is INCOMPLETE.**

## Toolchain

| Tool | Purpose | Install |
|------|---------|---------|
| Foundry | Build, test, deploy | `curl -L https://foundry.paradigm.xyz \| bash` |
| Halmos | Symbolic execution (dev loop) | `pip install halmos` |
| Kontrol | Formal verification (K semantics) | `kup install kontrol` |

### Project Structure

```
contracts/
├── src/                 # Production contracts
├── test/                # Unit + fuzz tests
├── test/symbolic/       # Halmos check_ functions
├── test/invariants/     # Kontrol K specifications
├── script/              # Deployment + e2e scripts
└── foundry.toml
```

## Solidity Standards

### Version & Pragma

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;  // Pin exact version, no floating ^
```

### No Upgradeable Contracts

Contracts are **immutable**. No proxy patterns, no UUPS, no transparent proxies. This simplifies formal verification.

### Contract Governance

Admin keys have exactly **one** permitted action:

```solidity
/// @notice Permanently disables the contract
/// @dev Only callable by admin. Irreversible. Used for migration to new contract version.
function deprecate() external onlyAdmin {
    deprecated = true;
    emit Deprecated(block.timestamp);
}

modifier notDeprecated() {
    if (deprecated) revert ContractDeprecated();
    _;
}
```

All user-facing functions must include the `notDeprecated` modifier. When migrating to a new immutable contract version, call `deprecate()` on the old contract to brick it and prevent further usage.

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Contracts | PascalCase | `AuctionHouse` |
| Functions | camelCase | `placeBid()` |
| Constants | SCREAMING_SNAKE | `MAX_BID_AMOUNT` |
| Events | PascalCase | `BidPlaced` |
| Errors | PascalCase | `InsufficientBalance` |
| Internal funcs | _prefixed | `_validateBid()` |

### NatSpec Documentation

Required for all public/external functions:

```solidity
/// @notice Places a bid in the auction
/// @dev Checks-Effects-Interactions pattern enforced
/// @param auctionId The auction to bid on
/// @param amount Bid amount in wei
/// @return bidId Unique identifier for this bid
/// @custom:security Reentrancy protected via state update before external call
function placeBid(uint256 auctionId, uint256 amount) external returns (uint256 bidId) {
    // implementation
}
```

## Testing Pipeline

### Phase 1: Unit Tests (Forge)

Fast feedback loop during development.

```bash
forge test -vvv
```

```solidity
// test/AuctionHouse.t.sol
function test_placeBid_success() public {
    uint256 bidId = auctionHouse.placeBid{value: 1 ether}(auctionId, 1 ether);
    assertEq(auctionHouse.getBid(bidId).amount, 1 ether);
}

function test_placeBid_revertsWhenAuctionEnded() public {
    vm.warp(auctionEndTime + 1);
    vm.expectRevert(AuctionEnded.selector);
    auctionHouse.placeBid{value: 1 ether}(auctionId, 1 ether);
}
```

### Phase 2: Fuzz Tests (Forge)

Randomized inputs to find edge cases.

```bash
forge test --fuzz-runs 10000
```

```solidity
function testFuzz_placeBid_neverExceedsBalance(uint256 amount) public {
    vm.assume(amount > 0 && amount <= address(this).balance);
    auctionHouse.placeBid{value: amount}(auctionId, amount);
    assertLe(auctionHouse.totalBids(), address(auctionHouse).balance);
}
```

### Phase 3: Symbolic Execution (Halmos)

**Dev loop tool** - Run continuously while coding. Catches 95% of bugs.

```bash
halmos --contract AuctionHouseTest
```

Use `check_` prefix for symbolic tests:

```solidity
// test/symbolic/AuctionHouse.symbolic.t.sol
function check_withdrawNeverExceedsDeposit(address user, uint256 amount) public {
    // Symbolic: prove for ALL possible inputs
    vm.assume(amount > 0);
    
    uint256 balanceBefore = token.balanceOf(user);
    
    vm.prank(user);
    vault.withdraw(amount);
    
    uint256 balanceAfter = token.balanceOf(user);
    
    // Invariant: user cannot extract more than they deposited
    assert(balanceAfter - balanceBefore <= vault.deposits(user));
}

function check_totalSupplyPreserved(address from, address to, uint256 amount) public {
    uint256 supplyBefore = token.totalSupply();
    
    vm.prank(from);
    token.transfer(to, amount);
    
    // Invariant: transfers never change total supply
    assert(token.totalSupply() == supplyBefore);
}
```

### Phase 4: Formal Verification (Kontrol)

**Final audit gate** - Mathematical proof of invariants using K semantics. Required for ALL contracts before deployment.

```bash
kontrol build
kontrol prove --match-test "check_"
```

#### Canonical Invariants to Prove

Every contract must prove these invariant patterns where applicable:

```solidity
// 1. Balance safety: funds cannot decrease without explicit user action
function check_balanceNeverDecreasesWithoutWithdraw(address user) public {
    uint256 balanceBefore = vault.balanceOf(user);
    
    // Execute any non-withdraw function symbolically
    // ... 
    
    // If user didn't call withdraw, balance cannot decrease
    assert(vault.balanceOf(user) >= balanceBefore);
}

// 2. Authorization: only owner can call admin functions  
function check_onlyOwnerCanPause(address caller) public {
    vm.assume(caller != vault.owner());
    
    vm.prank(caller);
    vm.expectRevert();
    vault.pause();
}

// 3. State consistency: critical state variables remain valid
function check_totalDepositsMatchesSum() public {
    uint256 sum = 0;
    for (uint i = 0; i < users.length; i++) {
        sum += vault.deposits(users[i]);
    }
    assert(vault.totalDeposits() == sum);
}
```

## E2E Tests with Docker Testnet

E2E tests run against a real Geth + Lighthouse stack. Use TypeScript SDK for orchestration, Forge scripts for contract interaction.

### TypeScript Orchestration

```typescript
// test/e2e/auction.e2e.test.ts
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { exec } from "child_process";

describe("Auction E2E", () => {
    let testnet: EthereumDockerTestnet;

    beforeAll(async () => {
        testnet = await EthereumDockerTestnet.new(4);
        await testnet.waitForHealthy();
    }, 120000);

    afterAll(async () => {
        await testnet.teardown();
    });

    it("should complete full auction lifecycle", async () => {
        const rpcUrl = testnet.getExecutionRpcUrl();
        
        // Deploy via forge script
        await execPromise(`forge script script/Deploy.s.sol --rpc-url ${rpcUrl} --broadcast`);
        
        // Run auction lifecycle script
        await execPromise(`forge script script/E2EAuction.s.sol --rpc-url ${rpcUrl} --broadcast`);
    });
});
```

### Forge Scripts for Contract Interaction

```solidity
// script/E2EAuction.s.sol
contract E2EAuctionScript is Script {
    function run() external {
        vm.startBroadcast();
        
        AuctionHouse auction = AuctionHouse(vm.envAddress("AUCTION_ADDRESS"));
        
        // Place bids from multiple accounts
        auction.placeBid{value: 1 ether}(0, 1 ether);
        
        // Advance time and settle
        vm.warp(block.timestamp + 1 days);
        auction.settle(0);
        
        // Verify final state
        require(auction.isSettled(0), "Auction should be settled");
        
        vm.stopBroadcast();
    }
}
```

## Security Checklist

Before marking complete, verify:

- [ ] **CEI Pattern** - Checks-Effects-Interactions in all external calls
- [ ] **Reentrancy** - State updated before external calls
- [ ] **Access Control** - All admin functions protected
- [ ] **Integer Safety** - Solidity 0.8+ handles overflow (verify unchecked blocks)
- [ ] **Input Validation** - All external inputs validated
- [ ] **No tx.origin** - Use msg.sender only
- [ ] **Pull over Push** - Users withdraw funds, contract doesn't push

## CI Integration

Required CI checks (all must pass):

| Check | Workflow File | Command |
|-------|---------------|---------|
| Build | `solidity-build.yml` | `forge build --force` |
| Unit Tests | `solidity-test.yml` | `forge test -vvv` |
| Fuzz Tests | `solidity-fuzz.yml` | `forge test --fuzz-runs 10000` |
| Halmos | `solidity-halmos.yml` | `halmos --contract *Test` |
| Kontrol | `solidity-kontrol.yml` | `kontrol build && kontrol prove` |
| E2E Tests | `solidity-e2e.yml` | Docker testnet + forge scripts |

## Quick Reference

```bash
# Build
forge build

# Test (unit + fuzz)
forge test -vvv --fuzz-runs 10000

# Symbolic (dev loop - run frequently)
halmos --contract AuctionHouseTest

# Formal verification (before PR/deploy)
kontrol build && kontrol prove

# E2E (requires Docker)
cd source/docker-testnet/ethereum-testnet/config
docker compose up -d
forge script script/E2E.s.sol --rpc-url http://localhost:8545 --broadcast
docker compose down -v

# Full validation before commit
forge build && forge test --fuzz-runs 10000 && halmos && kontrol prove
```

## Related Documentation

- [Docker Testnet README](../../source/docker-testnet/ethereum-testnet/README.md)
- [Rust Coding Guidelines](./rust-coding-guidelines.md)
- [Move Coding Guidelines](./move-coding-guidelines.md)
- [Consensus Critical Guidelines](./consensus-critical-guidelines.md)
