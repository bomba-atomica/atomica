# Gas Sponsorship Analysis for Ethereum Wallet Users

## Executive Summary

**Default Choice**: **Contract-Sponsored Gas (Option #2)**

For Ethereum wallet users (MetaMask, etc.) signing Atomica transactions via SIWE, Atomica uses a **pre-funding model** where a smart contract sponsors new users by transferring initial AUA tokens to their derived Zapatos addresses. After this one-time setup, users submit all transactions in **pure P2P mode** directly to Zapatos RPC endpoints.

**Rationale**: This approach maximizes decentralization, censorship resistance, and user autonomy while solving the cold-start problem for new users.

---

## Problem Statement

Ethereum wallet users (MetaMask, etc.) signing Atomica transactions via SIWE face a bootstrapping problem:
- They have **no Zapatos account** (never interacted with the chain before)
- They have no AUA tokens to pay gas
- They cannot submit their first transaction without gas tokens

**Critical Constraint**: In Aptos/Zapatos architecture, gas payment is enforced at the VM level in the transaction prologue (BEFORE any Move code executes). This means:
- Smart contracts **cannot** pay gas on behalf of users
- No way for contract code to intercept or subsidize gas payments
- Someone with AUA balance must sign as gas payer

**The Reality**: A minimal backend FeePayer service is **required** for gasless onboarding. This is not a design choice - it's an architectural limitation of the Aptos VM.

---

## Solution Options Analysis

### Option 1: FeePayer Backend Service ⭐ **REQUIRED FOR ONBOARDING**

**Description**: A backend service with a private key signs as FeePayer for new user transactions. This is the **only way** to enable gasless onboarding in Aptos/Zapatos.

**Why It's Required**: Gas payment happens in the transaction prologue (before Move code execution). Smart contracts cannot intervene or pay gas. An account with AUA balance must sign as fee payer.

**Architecture**:
```
Browser → Sign SIWE → Send to FeePayer Service → Add FeePayer Signature → Submit to Zapatos
```

**Flow**:
1. User signs SIWE message in MetaMask (authenticates transaction)
2. Frontend sends to FeePayer service API
3. Service validates eligibility (rate limits, Ethereum balance check)
4. Service wraps transaction with FeePayer authenticator:
   ```rust
   TransactionAuthenticator::FeePayer {
       sender: Abstract(ethereum_derivable_account + user_SIWE_signature),
       fee_payer_address: SPONSOR_ACCOUNT,
       fee_payer_signer: sponsor_signature
   }
   ```
5. Service submits to Zapatos
6. User's account is auto-created (if first transaction)
7. Gas paid by sponsor account

**Optional Enhancement**: After first transaction, sponsor can transfer AUA to user for future P2P transactions.

**Pros**:
- ✅ Enables gasless onboarding (only option that works)
- ✅ User sees no difference from "pure P2P" (signs once in MetaMask)
- ✅ Account auto-created on first transaction
- ✅ Simple to implement (one backend account)
- ✅ Industry standard (Coinbase, Safe, etc.)

**Cons**:
- ⚠️ Requires backend infrastructure
- ⚠️ Single point of failure (if service down, new users can't onboard)
- ⚠️ Service can theoretically censor (mitigated by Option 2)

**Implementation Requirements**:
- Single backend account with private key
- API endpoint to receive user-signed transactions
- Rate limiting and anti-sybil mechanisms
- Monitoring for gas pool depletion

---

### Option 2: User Has Tokens (Pure P2P)

**Description**: Users who already have AUA tokens submit transactions directly, or users who received tokens via Option 1.

**Flow**:
```
Browser → Sign SIWE → Submit to Zapatos RPC → Validators Verify → Execute
```

**Pros**:
- ✅ Fully decentralized
- ✅ No intermediaries
- ✅ Zero relayer dependency
- ✅ Works with any RPC endpoint
- ✅ Censorship-resistant

**Cons**:
- ❌ Doesn't solve cold start problem
- ❌ Requires users to acquire tokens first (via Option 1 or other means)

**When to use**:
- Existing users with AUA balance
- After first transaction via Option 1 (if sponsor transferred balance)

**Detailed Flow**:

1. **User's First Transaction** (e.g., Place Bid):
   - User signs SIWE message in MetaMask
   - Frontend sends to FeePayer service API
   - Service validates: rate limits, Ethereum balance, anti-sybil checks
   - Service adds FeePayer signature
   - Service submits to Zapatos
   - User's account auto-created (implicit account creation via FeePayer)
   - Bid executes, gas paid by sponsor

2. **Optional: Pre-fund for Future P2P** (can happen during first tx):
   ```move
   public entry fun place_bid_with_sponsorship(
       user: &signer,
       bid_amount: u64
   ) {
       let user_addr = signer::address_of(user);

       // Sponsor transfers balance for future txs
       if (should_sponsor(user_addr)) {
           coin::transfer<AptosCoin>(&sponsor_signer, user_addr, 1000_AUA);
       };

       // Execute bid
       execute_bid(user, bid_amount);
   }
   ```

3. **Future Transactions** (if pre-funded):
   - User signs SIWE in MetaMask
   - Submits directly to any Zapatos RPC (P2P!)
   - Gas deducted from user's balance
   - No FeePayer service involved

**FeePayer Service Implementation**:

```typescript
// Backend service that sponsors transactions
class FeePayerService {
    private sponsorAccount: Account;
    private ethereumRpc: EthereumRpcClient;
    private sponsoredDeposits: Set<string>; // Track deposit tx hashes

    async requestSponsorship(req: {
        ethereumAddress: string,
        depositTxHash: string,
    }): Promise<void> {
        // 1. Verify deposit on Ethereum
        const deposit = await this.verifyEthereumDeposit(
            req.depositTxHash,
            req.ethereumAddress
        );

        // 2. Check deposit meets requirements
        if (deposit.amount < MIN_DEPOSIT_AMOUNT) {
            throw new Error('Deposit too small');
        }

        // 3. Check not already used for sponsorship
        if (this.sponsoredDeposits.has(req.depositTxHash)) {
            throw new Error('Deposit already used for sponsorship');
        }

        // 4. Mark as sponsored
        this.sponsoredDeposits.add(req.depositTxHash);

        // 5. Transfer initial AUA to derived Zapatos address
        const zapatosAddress = deriveAddress(req.ethereumAddress, DOMAIN);
        await this.transferAUA(zapatosAddress, INITIAL_BALANCE);

        console.log(`Sponsored ${req.ethereumAddress} with ${INITIAL_BALANCE} AUA`);
    }

    async sponsorTransaction(req: {
        userSignedTx: RawTransaction,
        userSIWESignature: string,
        ethereumAddress: string,
    }): Promise<string> {
        // 1. Check if eligible (has been sponsored OR has balance)
        const zapatosAddress = deriveAddress(req.ethereumAddress, DOMAIN);
        const hasBalance = await this.checkBalance(zapatosAddress);

        if (!hasBalance && !await this.isSponsored(req.ethereumAddress)) {
            throw new Error('Not eligible for sponsorship. Please deposit first.');
        }

        // 2. If has balance, let them submit P2P (no FeePayer needed)
        if (hasBalance) {
            return await this.submitDirectly(req.userSignedTx, req.userSIWESignature);
        }

        // 3. If no balance but sponsored, wrap with FeePayer
        const feePayerTx = {
            raw_transaction: req.userSignedTx,
            authenticator: {
                type: 'FeePayer',
                sender: {
                    type: 'Abstract',
                    function_info: '0x1::ethereum_derivable_account::authenticate',
                    auth_data: {
                        digest: calculateDigest(req.userSignedTx),
                        abstract_signature: req.userSIWESignature,
                        abstract_public_key: encodePublicKey(req.ethereumAddress, DOMAIN)
                    }
                },
                secondary_signer_addresses: [],
                secondary_signers: [],
                fee_payer_address: this.sponsorAccount.address(),
                fee_payer_signer: {
                    type: 'Ed25519',
                    public_key: this.sponsorAccount.publicKey(),
                    signature: await this.sponsorAccount.sign(req.userSignedTx)
                }
            }
        };

        return await this.submitTransaction(feePayerTx);
    }

    private async verifyEthereumDeposit(
        txHash: string,
        fromAddress: string
    ): Promise<{ amount: bigint, to: string }> {
        // Get transaction receipt from Ethereum
        const receipt = await this.ethereumRpc.getTransactionReceipt(txHash);

        // Verify transaction is confirmed
        if (!receipt || receipt.confirmations < MIN_CONFIRMATIONS) {
            throw new Error('Transaction not confirmed');
        }

        // Verify depositor address
        const tx = await this.ethereumRpc.getTransaction(txHash);
        if (tx.from.toLowerCase() !== fromAddress.toLowerCase()) {
            throw new Error('Transaction not from claimed address');
        }

        // Verify deposit is to correct bridge contract
        if (tx.to.toLowerCase() !== BRIDGE_CONTRACT_ADDRESS.toLowerCase()) {
            throw new Error('Deposit not to bridge contract');
        }

        // Parse deposit amount from transaction data or logs
        const deposit = this.parseDepositAmount(receipt.logs);

        // Optional: Verify with Merkle proof for trustlessness
        // const proof = await this.ethereumLightClient.getInclusionProof(txHash);
        // const verified = await this.ethereumLightClient.verifyProof(proof);

        return {
            amount: deposit.amount,
            to: tx.to
        };
    }

    private async isSponsored(ethAddress: string): Promise<boolean> {
        // Check if this address has an associated sponsored deposit
        // Could query database or check on-chain state
        return this.sponsoredDeposits.has(ethAddress);
    }
}
```

**Anti-Sybil Mechanisms**:

**Recommended: Oracle-Based Automatic Sponsorship** ⭐⭐

An oracle service monitors Ethereum deposit contract for state changes and automatically creates/funds Zapatos accounts. This is implemented as a **public Move contract** that anyone can call, with a canonical service for reliability.

**Architecture**:

1. **Ethereum Side**:
   - User deposits USDC to bridge contract
   - Emits `Deposit` event with user's Ethereum address and amount

2. **Oracle Service** (off-chain, permissionless):
   - Monitors Ethereum deposit contract for events
   - Detects new deposit: `Deposit(user: 0xABCD...1234, amount: 100 USDC)`
   - Fetches Ethereum state proof (Merkle proof of deposit)
   - Calls Zapatos contract with proof

3. **Zapatos Contract** (on-chain, public):
   ```move
   module atomica::ethereum_deposit_oracle {
       /// Anyone can call this to process an Ethereum deposit
       public entry fun process_ethereum_deposit(
           caller: &signer,
           ethereum_depositor: vector<u8>,  // Ethereum address
           deposit_amount: u64,
           ethereum_block_hash: vector<u8>,
           state_proof: vector<u8>,        // Merkle proof
       ) {
           // 1. Verify Ethereum state proof against known block hash
           assert!(verify_ethereum_state_proof(
               ethereum_block_hash,
               state_proof,
               ethereum_depositor,
               deposit_amount
           ), E_INVALID_PROOF);

           // 2. Check deposit not already processed
           assert!(!is_processed(ethereum_depositor), E_ALREADY_PROCESSED);

           // 3. Derive Zapatos address from Ethereum address
           let zapatos_address = derive_zapatos_address(ethereum_depositor, DOMAIN);

           // 4. Transfer initial AUA to derived address
           coin::transfer<AptosCoin>(&resource_signer, zapatos_address, INITIAL_BALANCE);

           // 5. Mark as processed
           mark_processed(ethereum_depositor);

           emit(DepositProcessed { ethereum_depositor, zapatos_address, deposit_amount });
       }
   }
   ```

4. **User Experience** (FULLY AUTOMATIC):
   - User deposits on Ethereum
   - Waits ~1 minute (for Ethereum finality + oracle processing)
   - Zapatos account automatically created and funded
   - User can immediately start transacting (P2P!)
   - **No manual "request sponsorship" step needed**

**Benefits**:
- ✅ **Fully automatic**: No user action needed after deposit
- ✅ **Decentralized**: Anyone can run oracle and call contract
- ✅ **Verifiable on-chain**: Ethereum state proofs validated in Move
- ✅ **Permissionless**: Public contract, canonical service for reliability
- ✅ **Capital-gated**: Requires real deposit (strong anti-sybil)
- ✅ **One sponsorship per deposit**: Enforced on-chain
- ✅ **Trustless** (with light client): Cryptographic proof of Ethereum state

**Implementation Options**:

**Option A: Simple (Ethereum RPC verification)**
- Oracle queries Ethereum RPC for deposit transaction
- Oracle submits deposit info to Zapatos contract
- Contract trusts oracle (requires reputation/staking)
- Fast to implement, requires trust in oracle

**Option B: State Proofs (Merkle proofs)**
- Oracle submits Ethereum state Merkle proof
- Contract verifies proof against known Ethereum block hash
- Block hash updated via separate oracle (e.g., Chainlink)
- More complex, but verifiable

**Option C: ZK Light Client (Fully Trustless)**
- Oracle submits ZK proof of Ethereum state
- Contract verifies ZK proof
- No trust assumptions
- Most complex, but fully decentralized

**Canonical Service**:
```typescript
// Anyone can run this oracle
class EthereumDepositOracle {
    async monitorDeposits() {
        // Subscribe to Ethereum deposit events
        const filter = bridgeContract.filters.Deposit();

        bridgeContract.on(filter, async (depositor, amount, event) => {
            console.log(`New deposit: ${depositor} deposited ${amount}`);

            // Wait for finality
            await event.wait(12); // 12 confirmations

            // Get state proof
            const proof = await this.getStateProof(event.transactionHash);

            // Call Zapatos contract
            await zapatosContract.process_ethereum_deposit(
                depositor,
                amount,
                event.blockHash,
                proof
            );

            console.log(`✅ Processed deposit for ${depositor}`);
        });
    }
}
```

**Comparison to Faucet Approach**:

| Aspect | Oracle (Automatic) ⭐ | Faucet (Manual) |
|--------|----------------------|-----------------|
| **User action** | None (automatic) | Must request sponsorship |
| **Decentralization** | Anyone can run oracle | Centralized faucet |
| **On-chain verification** | ✅ State proofs | ❌ Off-chain verification |
| **Permissionless** | ✅ Public contract | ⚠️ Faucet controls |
| **Trust assumptions** | Minimal (with proofs) | Trust faucet service |
| **UX** | ✅ Seamless | ⚠️ Extra step |

**Alternative: Balance-Based Sponsorship**

For users who haven't deposited yet:

1. **Rate Limiting**:
   - Per Ethereum address: 1 sponsored tx per day
   - Global: Max 1000 sponsored txs per day
   - IP-based rate limiting

2. **Ethereum Balance Verification**:
   - Minimum: 0.01 ETH on Ethereum mainnet
   - Verified via Ethereum RPC call

3. **Behavioral Analysis**:
   - Track transaction patterns
   - Flag suspicious activity

**Recommended Approach**: Start with deposit-gated sponsorship as primary mechanism, fall back to balance-based for edge cases.

**Cost Analysis**:

Assuming:
- 1000 new users/month
- 10 transactions/user before they get own tokens
- Average 0.001 AUA per transaction

**Monthly cost**: ~10 AUA for gas sponsorship

**This is negligible** compared to:
- Running ZK light client: ~$5-10K/month
- Complex contract sponsorship pool: Significant smart contract risk

**Infrastructure Requirements**:
- Single backend server (can be serverless)
- One hot wallet with AUA balance
- Simple API endpoint
- Rate limiting service (Redis)
- Monitoring/alerting

**This is the simplest possible solution.**

---

### Option 3: User Acquires Tokens Manually

**Description**: A backend service adds fee payer signature to each transaction.

**Flow**:
```
Browser → Sign SIWE → Send to Fee Payer API → Fee Payer Adds Signature → Submit to Zapatos
```

**Pros**:
- ✅ No upfront setup phase
- ✅ Dynamic per-transaction control
- ✅ Easy to implement

**Cons**:
- ❌ **Relayer dependency** - Every transaction needs relayer
- ❌ **Censorship risk** - Relayer can block transactions
- ❌ **Single point of failure** - Relayer downtime = no transactions
- ❌ **Poor UX** - Slower (extra network hop)
- ❌ **Centralization** - Users must trust relayer

**When to use**: Fallback option if user cannot be sponsored (daily limit exceeded, etc.)

---

## Comparison Matrix

| Aspect | Option 1: FeePayer Service ⭐ | Option 2: Pure P2P | Option 3: Manual Tokens |
|--------|-------------------------------|-------------------|------------------------|
| **Solves cold start** | ✅ Yes (only option) | ❌ No | ❌ No |
| **Gasless onboarding** | ✅ Yes | ❌ No | ❌ No |
| **Backend required** | ✅ Yes (minimal) | ❌ No | ❌ No |
| **User UX** | ✅ Seamless | ✅ Simple | ❌ Complex |
| **P2P after onboarding** | ✅ Yes (if pre-funded) | ✅ Yes | ✅ Yes |
| **Censorship resistance** | ⚠️ Service can censor | ✅ High | ✅ High |
| **Infrastructure cost** | Low (one server) | None | None |
| **Gas cost** | ~10 AUA/month | None | None |
| **Sybil resistance** | ⚠️ Required | N/A | N/A |
| **Production ready** | ✅ Industry standard | ✅ Yes | ✅ Yes |

---

## Decision: FeePayer Backend Service (Option #1) - Required

### The Hard Truth

After comprehensive research of Zapatos/Aptos architecture, **there is no alternative** to a backend FeePayer service for gasless onboarding:

**Why contracts cannot sponsor gas**:
```move
// From transaction_validation.move - runs BEFORE any Move code
fun fee_payer_script_prologue(gas_payer: address, ...) {
    // Gas validation happens first
    assert!(coin::balance<AptosCoin>(gas_payer) >= max_fee);

    // ONLY THEN does transaction execute
    // No way for Move code to intervene
}
```

**Architectural reality**:
- Gas payment enforced at VM level in prologue
- Prologue runs BEFORE any Move code execution
- Smart contracts cannot intercept or subsidize gas
- An account with private key must sign as FeePayer

### Why This Is Acceptable

**This is the industry standard**:
- Coinbase Smart Wallet: Uses FeePayer service
- Safe (Gnosis): Uses relayer for gasless transactions
- All major AA providers: FeePayer backend required

**The backend is minimal**:
- Single server (can be serverless)
- One hot wallet
- Simple API endpoint
- ~10 AUA/month in gas costs

**After first transaction**:
- Can transfer balance to user for future P2P
- User gains censorship resistance
- User can choose any RPC endpoint

**This is NOT the same as traditional L2 relayers**:
- No batching, sequencing, or state management
- No Ethereum L1 submission
- Just adds a signature and forwards
- Transparent, simple, auditable

### Recommended Implementation: Oracle-Based Automatic Sponsorship

**Fully Automated Architecture**:

```
┌──────────────────────────────────────────────────────────────────┐
│                    ETHEREUM SIDE                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  User (MetaMask)                                                 │
│  └─> Deposits $100 USDC to Bridge Contract                      │
│       │                                                            │
│       ↓                                                            │
│  Bridge Contract                                                 │
│  └─> Emits: Deposit(user: 0xABCD, amount: 100 USDC)            │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
         │
         │ Oracle monitors events
         ↓
┌──────────────────────────────────────────────────────────────────┐
│                 ORACLE SERVICE (Permissionless)                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Oracle (anyone can run!)                                        │
│  ├─> Detects deposit event                                       │
│  ├─> Waits for finality (12 confirmations)                       │
│  ├─> Fetches Ethereum state proof                                │
│  └─> Calls Zapatos contract with proof                           │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────────────┐
│                ZAPATOS PUBLIC CONTRACT (On-Chain)                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  atomica::ethereum_deposit_oracle::process_ethereum_deposit()   │
│  ├─> Verify Ethereum state proof                                 │
│  ├─> Check deposit not already processed                         │
│  ├─> Derive Zapatos address from Ethereum address                │
│  ├─> Transfer 1000 AUA to derived address                        │
│  └─> Account implicitly created!                                 │
│                                                                    │
│  ✅ User's Zapatos account funded automatically                   │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────────────┐
│                  USER TRANSACTIONS (Pure P2P)                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  User (MetaMask)                                                 │
│  └─> Sign SIWE for "Place Bid"                                   │
│       │                                                            │
│       ↓                                                            │
│  Zapatos RPC (any endpoint!)                                     │
│  ├─> Verify SIWE signature                                       │
│  ├─> Execute bid                                                  │
│  └─> Deduct gas from user's balance                              │
│                                                                    │
│  ✅ Pure P2P forever!                                             │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Key Advantages**:
- ✅ **Fully automatic**: User deposits on Ethereum, Zapatos account created automatically
- ✅ **Permissionless**: Anyone can run oracle and call public contract
- ✅ **Verifiable on-chain**: Ethereum state proofs validated in Move code
- ✅ **Decentralized**: No single point of failure
- ✅ **Capital-gated**: Requires real deposit (strong anti-sybil)
- ✅ **Canonical service**: Protocol runs reliable oracle, but anyone can too
- ✅ **No user action needed**: No "request sponsorship" button
- ✅ **Pure P2P after setup**: All transactions directly to Zapatos

**Comparison to Other Approaches**:

| Aspect | Oracle (Automatic) ⭐⭐ | Faucet (Manual) | FeePayer (Per-tx) |
|--------|----------------------|-----------------|-------------------|
| **User action** | ❌ None (auto) | ⚠️ Must request | ⚠️ Every tx |
| **Decentralized** | ✅ Permissionless | ❌ Centralized | ❌ Centralized |
| **Verification** | ✅ On-chain proofs | ⚠️ Off-chain | ❌ Trust service |
| **After setup** | ✅ Pure P2P | ✅ Pure P2P | ❌ Needs service |
| **Implementation** | ⚠️ Complex | ✅ Simple | ✅ Simple |

### User Experience Flow

**First-time user Sarah** (oracle-based - AUTOMATIC):
1. Opens Atomica, connects MetaMask
2. Clicks "Deposit $100 USDC" on Ethereum
3. Signs Ethereum transaction in MetaMask
4. Deposit completes on Ethereum (emits `Deposit` event)
5. **[AUTOMATIC]** Oracle detects deposit, waits for finality
6. **[AUTOMATIC]** Oracle calls Zapatos contract with state proof
7. **[AUTOMATIC]** Contract creates account and transfers 1000 AUA
8. UI shows: "✅ Deposit confirmed! Your Zapatos account is ready."
9. Now clicks "Place Bid on Item #42"
10. Signs SIWE message in MetaMask
11. Submits directly to Zapatos (P2P!) - uses her 1000 AUA for gas
12. ✅ Bid executes instantly

**Returning user Bob**:
1. Opens Atomica, connects MetaMask
2. Clicks "Place Bid"
3. Signs SIWE message
4. Submits directly to Zapatos (P2P!)
5. ✅ Instant execution

**Advanced user Charlie** (runs own oracle):
1. Runs own Ethereum deposit oracle service
2. Earns gas refunds for processing deposits
3. Contributes to network decentralization
4. No permission needed - contract is public!

---

## Handling Edge Cases

**If FeePayer service is down**:
- Show error: "Sponsorship service temporarily unavailable"
- Offer manual token acquisition (faucet link)
- Provide status page

**If daily limit exceeded**:
- Show: "Daily sponsorship limit reached. Try again in X hours"
- Offer manual faucet option
- For high-value users: Manual approval via Discord/support

**If user already has balance**:
- Skip FeePayer service entirely
- Submit directly P2P
- Faster and more decentralized

**Gradual decentralization path**:
1. Start: All users via FeePayer (simple, reliable)
2. Phase 2: Pre-fund users for future P2P (hybrid)
3. Phase 3: Most users P2P, FeePayer only for new onboarding
4. End state: Minimal reliance on FeePayer service

---

## Conclusion

**Recommended Strategy: Oracle-Based Automatic Sponsorship** ⭐⭐

For Atomica's cross-chain auction platform, the oracle-based approach is optimal:

**Why Oracle > Faucet > FeePayer**:
1. ✅ **Fully automatic**: User just deposits on Ethereum, Zapatos account auto-created
2. ✅ **Decentralized**: Permissionless oracle, public contract, anyone can participate
3. ✅ **Verifiable**: On-chain Ethereum state proofs, no trust needed
4. ✅ **Capital-gated**: Requires real deposit, strongest anti-sybil
5. ✅ **Pure P2P after setup**: All transactions directly to Zapatos, no backend
6. ✅ **Seamless UX**: No extra "request sponsorship" step

**Implementation Path**:
1. **Phase 1** (MVP): Simple oracle with Ethereum RPC verification
2. **Phase 2**: Ethereum state Merkle proofs for better verification
3. **Phase 3**: ZK light client for full trustlessness

**Fallback Options**:
- **For users who haven't deposited**: Balance-based FeePayer service
- **For trying before depositing**: Limited FeePayer sponsorship

**Key Architectural Insight**:

While it's true that:
- Gas payment is enforced at VM level before Move code execution
- Smart contracts cannot pay gas for incoming transactions
- An account must exist with balance to pay gas

**The oracle design solves this by**:
- Pre-funding accounts automatically based on verifiable Ethereum events
- Using a public Move contract that anyone can call
- Separating sponsorship (one-time, automated) from transactions (P2P)

**This achieves**:
- ✅ Gasless onboarding for users (they don't pay AUA for setup)
- ✅ Decentralized operation (permissionless oracle)
- ✅ Pure P2P transactions (after automatic setup)
- ✅ No ongoing relayer dependency

This is the best of all worlds: automatic, decentralized, and user-friendly.

---

## Technical References

**Aptos/Zapatos Source Code**:
- **Transaction Validation**: `source/zapatos/aptos-move/framework/aptos-framework/sources/transaction_validation.move`
  - `fee_payer_script_prologue()` - Gas validation before execution
  - `epilogue_gas_payer_extended()` - Gas deduction after execution
- **Account Abstraction**: `source/zapatos/aptos-move/framework/aptos-framework/sources/account/account_abstraction.move`
  - `derive_account_address()` - Deterministic address derivation
- **Ethereum Derivable Account**: `source/zapatos/aptos-move/framework/aptos-framework/sources/account/common_account_abstractions/ethereum_derivable_account.move`
  - SIWE message verification
  - ECDSA signature recovery
- **Authenticators**: `source/zapatos/types/src/transaction/authenticator.rs`
  - `TransactionAuthenticator::FeePayer` (lines 93-129)
  - `AbstractAuthenticator` for SIWE

**Standards**:
- **EIP-4361 (SIWE)**: https://eips.ethereum.org/EIPS/eip-4361
- **Aptos Account Abstraction**: Feature flags #45 (AA), #46 (Derivable AA), #34 (Sponsored account creation)

**Related Documentation**:
- `docs/technical/native_ethereum_transactions.md` - SIWE implementation details
- `docs/technical/account-abstraction.md` - Account abstraction overview
