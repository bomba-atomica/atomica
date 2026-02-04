# Next Agent - Cross-Chain Lock Receipt E2E Testing

## Current Status

✅ **Completed:**
- Lock receipt Move module implemented and tested (all tests passing)
- Solidity contracts created (FakeETH, FakeUSD, LockBox)
- Proof destructuring helper added to eth_proof.move
- E2E test structure created
- Docker testnets verified (both Ethereum and Aptos run in containers)
- Code committed and pushed (build, lint, format all passing)

## What Needs to Be Done

### 1. Fix Solidity Contracts (HIGH PRIORITY)

**Issue**: The current contracts have several problems discovered during E2E test run:

**FakeETH.sol / FakeUSD.sol:**
- Current: `mint(address to, uint256 amount)`
- Problem: Test calls `mint(amount)` with only one parameter
- Fix: Add overloaded function `mint(uint256 amount)` that mints to `msg.sender`

**LockBox.sol:**
- Current: Only increments a counter, doesn't actually transfer tokens
- Problem: No actual token custody - just bookkeeping
- Fix: Add `transferFrom()` call to actually take custody of tokens:
  ```solidity
  function lock(address token, uint256 amount) external {
      require(token == fakeETH || token == fakeUSD, "Invalid token");
      
      // Actually transfer tokens to this contract
      IERC20(token).transferFrom(msg.sender, address(this), amount);
      
      // Update locked balance
      lockedBalances[msg.sender][token] += amount;
  }
  ```

**Files to modify:**
- `source/atomica-web/evm-contracts/src/FakeETH.sol`
- `source/atomica-web/evm-contracts/src/FakeUSD.sol`
- `source/atomica-web/evm-contracts/src/LockBox.sol`

### 2. Fix E2E Test Issues (HIGH PRIORITY)

**File**: `source/atomica-web/tests/integration/cross-chain/lock-receipt-e2e.test.ts`

**Problems found:**

a) **Transaction timing issues**
   - Tests run too fast - transactions not confirmed before next step
   - "transaction indexing in progress" errors
   - "replacement fee too low" errors from pending transactions
   
   **Fix**: Add proper wait delays after each transaction:
   ```typescript
   const tx = await contract.mint(amount);
   await tx.wait(); // Wait for confirmation
   await new Promise(r => setTimeout(r, 2000)); // Wait for indexing
   ```

b) **Contract deployment**
   - Test uses hardcoded addresses that don't exist
   - Needs actual deployment in beforeAll()
   
   **Fix**: Deploy contracts during test setup:
   ```typescript
   beforeAll(async () => {
       // ... testnet setup ...
       
       // Compile contracts
       await compileContracts();
       
       // Deploy FakeETH
       const fakeEthArtifact = getFakeETHArtifact();
       const FakeETHFactory = new ethers.ContractFactory(
           fakeEthArtifact.abi,
           fakeEthArtifact.bytecode.object,
           ethSigner
       );
       const fakeEthContract = await FakeETHFactory.deploy();
       await fakeEthContract.waitForDeployment();
       fakeEthAddress = await fakeEthContract.getAddress();
       
       // Similar for FakeUSD and LockBox...
   });
   ```

c) **Registry initialization failing**
   - Error: "Hex characters are invalid" when initializing Aptos registries
   - Issue: Contract addresses being passed incorrectly
   
   **Fix**: Check address format when calling `initialize<FakeETH>()`:
   ```typescript
   // Convert Ethereum address to proper format for Aptos
   const aptosAddress = ethereumToAptosAddress(fakeEthAddress);
   
   await aptosClient.transaction.build.simple({
       sender: aptosAccount.accountAddress,
       data: {
           function: `${ATOMICA_ADDR}::lock_receipt::initialize`,
           typeArguments: [`${ATOMICA_ADDR}::lock_receipt::FakeETH`],
           functionArguments: []
       }
   });
   ```

d) **Proof generation returns empty storage proof**
   - Storage proof has 0 nodes - lock wasn't found
   - Likely because lock transaction never succeeded
   - Fix: Ensure contracts work properly (see #1 above)

### 3. Integrate Lock Receipt with Asset Modules (MEDIUM PRIORITY)

**Files to modify:**
- `source/atomica-move-contracts/sources/fake_eth.move`
- `source/atomica-move-contracts/sources/fake_usd.move`

**Add mint_from_lock functions:**

```move
/// Mint FakeETH from a verified Ethereum lock receipt
public entry fun mint_from_lock(
    account: &signer,
    lock_id: vector<u8>,
) acquires FakeEthStore {
    let user = signer::address_of(account);
    
    // Claim receipt (verifies ownership and prevents double-claim)
    let amount_wei = lock_receipt::claim<lock_receipt::Ethereum, lock_receipt::FakeETH>(
        user,
        lock_id
    );
    
    // Convert wei (18 decimals) to FakeETH (8 decimals)
    // 1 ETH = 10^18 wei → 10^8 FakeETH units
    let amount = (amount_wei / 10000000000u256); // Divide by 10^10
    
    // Mint tokens
    mint_internal(user, amount);
}
```

Similar for `fake_usd.move` but with 6 decimal conversion (1:1 since both use 6 decimals).

### 4. Add E2E Test for Full Claiming Flow (MEDIUM PRIORITY)

Extend the E2E test to include:

```typescript
it("should claim receipt and mint tokens on Aptos", async () => {
    // 1. Register lock receipt (already done in previous test)
    
    // 2. Call fake_eth::mint_from_lock
    const mintTx = await aptosClient.transaction.build.simple({
        sender: aptosAccount.accountAddress,
        data: {
            function: `${ATOMICA_ADDR}::fake_eth::mint_from_lock`,
            functionArguments: [lockId]
        }
    });
    
    const committedTx = await aptosClient.signAndSubmitTransaction({
        signer: aptosAccount,
        transaction: mintTx
    });
    
    await aptosClient.waitForTransaction({ transactionHash: committedTx.hash });
    
    // 3. Verify FakeETH balance on Aptos
    const balance = await aptosClient.view({
        payload: {
            function: `${ATOMICA_ADDR}::fake_eth::balance_of`,
            functionArguments: [aptosAccount.accountAddress.toString()]
        }
    });
    
    expect(balance[0]).toBe(expectedAmount);
    
    // 4. Verify receipt is marked as claimed
    const receipt = await aptosClient.view({
        payload: {
            function: `${ATOMICA_ADDR}::lock_receipt::get_receipt`,
            typeArguments: [
                `${ATOMICA_ADDR}::lock_receipt::Ethereum`,
                `${ATOMICA_ADDR}::lock_receipt::FakeETH`
            ],
            functionArguments: [lockId]
        }
    });
    
    const [_user, _amount, _blockNum, status] = receipt;
    expect(status).toBe(1); // CLAIMED status
    
    // 5. Verify cannot claim again
    await expect(
        aptosClient.signAndSubmitTransaction({ /* same transaction */ })
    ).rejects.toThrow("E_RECEIPT_ALREADY_CLAIMED");
});
```

### 5. Documentation Updates (LOW PRIORITY)

**Update these files:**
- `docs/technical/lock-receipt-completion-plan.md` - Mark tasks as completed
- `source/atomica-move-contracts/LOCK_RECEIPT_IMPLEMENTATION.md` - Add claiming integration section
- `PHASE-4D-PROGRESS.md` - Update status to reflect E2E test progress

## Test Execution Strategy

### Recommended Order:

1. **Fix Solidity contracts** (30 minutes)
   - Add mint() overload
   - Fix LockBox to actually transfer tokens
   - Recompile with Foundry: `cd source/atomica-web/evm-contracts && forge build`

2. **Fix E2E test setup** (1 hour)
   - Add contract deployment
   - Add transaction confirmation delays
   - Fix registry initialization

3. **Run E2E test and debug** (1-2 hours)
   - Run test: `cd source/atomica-web && bun test tests/integration/cross-chain/lock-receipt-e2e.test.ts`
   - Fix any remaining issues (MPT proof verification, address conversion, etc.)
   - Verify all 7 test cases pass

4. **Add mint_from_lock integration** (30 minutes)
   - Update fake_eth.move and fake_usd.move
   - Deploy to testnet
   - Test claiming flow

5. **Add claiming E2E test** (30 minutes)
   - Extend test to include claiming
   - Verify double-claim prevention

6. **Clean up and document** (30 minutes)
   - Update documentation
   - Commit and push
   - Create PR with summary

**Total estimated time: 4-5 hours**

## Known Issues to Watch For

1. **MPT Proof Verification**
   - The integration_tests.move shows MPT verification is failing
   - This might be due to proof format issues or Move implementation bugs
   - May need to debug eth_proof.move or mpt.move

2. **Address Mapping**
   - Ethereum addresses are 20 bytes, Aptos are 32 bytes
   - Need proper conversion (implemented in address-converter.ts)
   - Verify the conversion works both ways

3. **Docker Container Processes**
   - All processes SHOULD be in Docker (verified ✅)
   - If you see aptos-node/lighthouse in `ps aux`, they're inside containers (check cgroup)
   - Use `docker ps` to verify containers are running

4. **Transaction Timing**
   - Geth sometimes returns "transaction indexing in progress"
   - Always add delays after transactions
   - Consider adding retry logic for robust tests

## Success Criteria

The work is complete when:

- ✅ All Solidity contracts work correctly (tokens actually locked)
- ✅ E2E test runs from start to finish without errors
- ✅ Proofs are generated correctly (non-empty storage proofs)
- ✅ Aptos accepts and verifies proofs
- ✅ Lock receipts are created with correct data
- ✅ Claiming flow works (mint tokens from receipts)
- ✅ Replay attacks are prevented
- ✅ All 7+ test cases pass
- ✅ Test completes in < 10 minutes
- ✅ Documentation updated

## Context for Next Agent

**Repository**: https://github.com/bomba-atomica/atomica  
**Branch**: `atomica-eth-testnet`  
**Last commit**: `2a7dbfb` - "feat: add Solidity contracts and proof destructuring for lock receipts"

**Key files to know:**
- Lock receipt Move module: `source/atomica-move-contracts/sources/lock_receipt.move`
- E2E test: `source/atomica-web/tests/integration/cross-chain/lock-receipt-e2e.test.ts`
- Solidity contracts: `source/atomica-web/evm-contracts/src/*.sol`
- Architecture doc: `docs/technical/lock-receipt-architecture.md`
- Test plan: `docs/technical/cross-chain-lock-receipt-e2e-test-plan.md`

**Running the test:**
```bash
cd source/atomica-web
bun install
bun test tests/integration/cross-chain/lock-receipt-e2e.test.ts
```

**Checking Docker containers:**
```bash
docker ps  # Should show both Ethereum and Aptos validators
docker top atomica-validator-0  # Check processes inside container
```

Good luck! The foundation is solid - just need to fix the contract bugs and test timing issues.
