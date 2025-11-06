# Atomica Diem Light Client Implementations

This directory contains complete, production-ready implementations of Diem/Aptos light client verification for Ethereum.

## Implementations

### [`diem-prover-native/`](./diem-prover-native/)

Native Solidity implementation with direct BLS12-381 signature verification.

**Pros:**
- ✅ Simple setup and deployment
- ✅ Immediate finality
- ✅ No off-chain infrastructure required
- ✅ Easy to audit and understand

**Cons:**
- ❌ Higher gas costs (~300K per update)
- ❌ No batching capability
- ❌ Signatures public on-chain

**Best for:**
- Development and testing
- Prototyping
- Low-volume applications
- Learning and experimentation

**Gas Costs:**
- Initialize: ~500,000
- Update: ~300,000
- Verify state: ~100,000

---

### [`diem-prover-zkp/`](./diem-prover-zkp/)

ZK-SNARK based implementation with off-chain BLS verification.

**Pros:**
- ✅ Lower gas costs with batching (~4K per update)
- ✅ Privacy preserving (signatures private)
- ✅ Scalable to high volume
- ✅ Production-grade efficiency

**Cons:**
- ❌ Complex setup (trusted ceremony)
- ❌ Requires prover infrastructure
- ❌ Proving latency (30-60s)
- ❌ More moving parts

**Best for:**
- Production bridges
- High-volume applications
- Privacy-sensitive use cases
- Long-term cost optimization

**Gas Costs:**
- Initialize: ~300,000
- Update (single): ~250,000
- Update (100 batched): ~400,000 (~4K each)

## Quick Start

### Native Prover

```bash
cd diem-prover-native
npm install
npm test
npm run deploy:local
```

### ZKP Prover

```bash
cd diem-prover-zkp
npm install
npm run compile:circuits
npm run setup:ceremony
npm run prover:build
npm test
npm run deploy:local
npm run prover:run
```

## Benchmarking

Run comparative benchmarks to evaluate both implementations:

```bash
# From source/ directory
./benchmark-comparison.sh
```

This will:
1. Deploy both implementations
2. Run identical test scenarios
3. Measure gas costs, latency, and throughput
4. Generate comparison report

## Performance Comparison

### Single Update

| Metric | Native | ZKP |
|--------|--------|-----|
| Gas cost | 300,000 | 250,000 |
| Latency | Immediate | 30-60s (proving) |
| Setup complexity | Simple | Complex |

### Batched Updates (100 transactions)

| Metric | Native | ZKP |
|--------|--------|-----|
| Gas cost | 30,000,000 | 400,000 |
| Cost per tx | 300,000 | 4,000 |
| Latency | Immediate | 60-90s |
| Savings | Baseline | **99% cheaper** |

## Architecture Comparison

```
Native Prover:
┌─────────┐
│  Diem   │
│StateProof│
└────┬────┘
     │ BLS sigs + proofs
     ↓
┌─────────┐
│Ethereum │
│ Verify  │ (~300K gas)
│  BLS    │
└─────────┘

ZKP Prover:
┌─────────┐
│  Diem   │
│StateProof│
└────┬────┘
     │
     ↓
┌─────────┐
│ Prover  │ (off-chain)
│ Verify  │
│  BLS    │
└────┬────┘
     │ ZK proof (256 bytes)
     ↓
┌─────────┐
│Ethereum │
│ Verify  │ (~250K gas)
│  Proof  │ (~4K batched)
└─────────┘
```

## Decision Matrix

### Choose Native If:
- ✅ Prototyping or development
- ✅ Low transaction volume (<10/day)
- ✅ Need immediate finality
- ✅ Want simplest possible setup
- ✅ Prefer public/auditable signatures

### Choose ZKP If:
- ✅ Production deployment
- ✅ High transaction volume (>100/day)
- ✅ Need maximum cost efficiency
- ✅ Have infrastructure for prover
- ✅ Want privacy for signatures
- ✅ Can tolerate 30-60s proving time

## Migration Path

**Recommended Approach:**

1. **Phase 1: Development** (1-2 months)
   - Use Native for rapid iteration
   - Build application logic
   - Test bridge mechanics

2. **Phase 2: Testing** (1-2 months)
   - Deploy Native to testnet
   - Set up ZKP prover infrastructure
   - Run parallel testing

3. **Phase 3: Hybrid** (3-6 months)
   - Deploy both to mainnet
   - Use Native for critical path
   - Use ZKP for bulk operations
   - Monitor performance

4. **Phase 4: Full ZKP** (after confidence)
   - Migrate entirely to ZKP
   - Maximize cost savings
   - Keep Native as emergency fallback

## Testing

Both implementations include comprehensive test suites:

```bash
# Run all tests
cd diem-prover-native && npm test
cd diem-prover-zkp && npm test

# Run benchmarks
cd diem-prover-native && npm run benchmark
cd diem-prover-zkp && npm run benchmark

# Generate gas reports
REPORT_GAS=true npm test
```

## Documentation

- **Technical Docs**: `../docs/technical/`
- **Quick Start**: `../docs/technical/QUICKSTART.md`
- **Architecture**: `../docs/technical/aptos_ethereum_bridge_implementation.md`
- **ZK Details**: `../docs/technical/aptos_zk_light_client.md`

## Production Checklist

### Native Prover
- [ ] Security audit (smart contracts)
- [ ] Gas optimization review
- [ ] Relayer service setup
- [ ] Monitoring and alerting
- [ ] Emergency pause mechanism
- [ ] Upgrade strategy

### ZKP Prover
- [ ] Trusted setup ceremony (multi-party)
- [ ] Circuit formal verification
- [ ] Security audit (contracts + circuits)
- [ ] Prover infrastructure (HA setup)
- [ ] Backup provers (redundancy)
- [ ] Monitoring (prover + on-chain)
- [ ] Fallback to Native (if prover fails)

## Common Issues

### Native Prover

**Issue**: High gas costs
**Solution**: Use ZKP for high-volume applications

**Issue**: BLS precompiles not available
**Solution**: Ensure network supports EIP-2537 (mainnet only)

### ZKP Prover

**Issue**: Circuit compilation fails
**Solution**: Ensure 16GB+ RAM, circom installed

**Issue**: Prover out of memory
**Solution**: Reduce MAX_VALIDATORS or use larger instance

**Issue**: Trusted setup concerns
**Solution**: Multi-party ceremony or use STARKs

## Support

- **GitHub Issues**: https://github.com/atomica/issues
- **Discord**: https://discord.gg/atomica
- **Email**: dev@atomica.xyz

## License

Apache-2.0 - See LICENSE file for details

## Contributing

See CONTRIBUTING.md for guidelines.

## Acknowledgments

- Aptos Labs for blockchain design
- Iden3 for circom and snarkjs
- Ethereum Foundation for EIP-2537
- ark-works for ZK primitives
