# Diem Prover Native

Native Solidity implementation of Aptos/Diem light client with direct BLS12-381 signature verification on Ethereum.

## Features

- ✅ Direct BLS12-381 aggregate signature verification using EIP-2537
- ✅ Merkle proof verification (accumulator + sparse Merkle tree)
- ✅ Epoch-based validator set management
- ✅ Complete test suite with gas reporting
- ✅ Benchmarking framework

## Architecture

```
DiemLightClient
├─ BLSVerifier (library)
│  ├─ Aggregate public keys (G1MULTIEXP precompile)
│  ├─ Hash to G2 curve
│  └─ Pairing check verification
├─ MerkleVerifier (library)
│  ├─ Accumulator proof verification
│  └─ Sparse Merkle proof verification
└─ State management
   ├─ TrustedState
   ├─ ValidatorSet per epoch
   └─ State update verification
```

## Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
```

## Installation

```bash
npm install
```

## Compilation

```bash
npm run compile
```

## Testing

```bash
# Run all tests
npm test

# Run with gas reporting
npm run test:gas

# Run coverage
npm run coverage

# Run benchmarks
npm run benchmark
```

## Gas Costs (Estimated)

| Operation | Gas Cost |
|-----------|----------|
| Initialize (10 validators) | ~500,000 |
| Update state (same epoch) | ~300,000 |
| Update state (epoch change) | ~800,000 |
| Verify account state | ~100,000 |
| Verify transaction | ~80,000 |

## Deployment

### Local testnet

```bash
# Terminal 1: Start Hardhat node
npx hardhat node

# Terminal 2: Deploy
npm run deploy:local
```

### Sepolia testnet

```bash
# Set environment variables
cp .env.example .env
# Edit .env with your keys

npm run deploy:sepolia
```

## Benchmarking

The benchmark suite measures:
- BLS signature verification (varying validator counts)
- Merkle proof verification (varying proof depths)
- State updates (with and without epoch changes)
- Concurrent operations

```bash
npm run benchmark
```

Results are saved to `benchmarks/results/`.

## Project Structure

```
diem-prover-native/
├── contracts/
│   ├── DiemLightClient.sol      # Main light client contract
│   ├── BLSVerifier.sol           # BLS signature verification
│   ├── MerkleVerifier.sol        # Merkle proof verification
│   └── interfaces/
│       └── IDiemLightClient.sol
├── test/
│   ├── DiemLightClient.test.ts
│   ├── BLSVerifier.test.ts
│   ├── MerkleVerifier.test.ts
│   └── Benchmark.test.ts
├── scripts/
│   ├── deploy.ts
│   └── utils/
│       ├── mockData.ts           # Generate test data
│       └── helpers.ts
├── benchmarks/
│   ├── gas-analysis.ts
│   └── results/
└── README.md
```

## Implementation Notes

### BLS12-381 Verification

Uses EIP-2537 precompiles (available on Ethereum mainnet):
- `0x0b` - G1 addition
- `0x0c` - G1 multiplication
- `0x0d` - G1 multi-exponentiation
- `0x0e` - G2 addition
- `0x0f` - G2 multiplication
- `0x10` - Pairing check
- `0x11` - Map to G1
- `0x12` - Map to G2

### Testing with Hardhat

Since Hardhat doesn't have native BLS precompiles, we:
1. Mock the precompile responses in tests
2. Use forked mainnet for integration tests
3. Provide test data with known-good signatures

### Optimization Strategies

1. **Calldata optimization**: Pack public inputs efficiently
2. **Batch operations**: Update multiple states in one transaction
3. **Storage patterns**: Minimize SSTORE operations
4. **View functions**: Keep verification logic in view when possible

## Comparison with ZKP Version

| Aspect | Native | ZKP |
|--------|--------|-----|
| Gas per update | ~300K | ~250K |
| Latency | Immediate | 30-60s (proving) |
| Setup | Simple | Complex (trusted setup) |
| Privacy | Public signatures | Private signatures |
| Batching | No | Yes (amortize to ~4K) |
| Dependencies | EIP-2537 only | Circuit + prover |

**When to use Native:**
- Quick prototyping
- Testing and development
- Applications that need immediate finality
- Simpler deployment and maintenance

**When to use ZKP:**
- Production bridges with high volume
- Applications that benefit from batching
- Privacy-sensitive use cases
- Long-term cost optimization

## Security Considerations

1. **Initial waypoint**: Must be from trusted source
2. **Validator set**: Trust Aptos BFT consensus (2/3+ honest)
3. **EIP-2537**: Requires mainnet or compatible network
4. **Reentrancy**: All state-changing functions protected
5. **Overflow**: Using Solidity 0.8.x built-in checks

## Troubleshooting

### "Unknown precompile" error
- Make sure you're using a network with EIP-2537 support
- For testing, use mocked precompiles or mainnet fork

### High gas costs
- Ensure optimizer is enabled
- Consider batching multiple updates
- Use view functions where possible

### Signature verification fails
- Check validator set matches the epoch
- Verify quorum threshold is met
- Ensure message hash is correct

## License

Apache-2.0

## Support

- Documentation: `../../docs/technical/`
- Issues: https://github.com/atomica/issues
- Discord: https://discord.gg/atomica
