# 🎯 START HERE

Quick navigation guide for the Atomica project.

## What Is This?

Complete implementations of Aptos/Diem light client verification for Ethereum, enabling trustless cross-chain bridges. Includes benchmarking tools to compare two approaches:
- **Native**: Direct BLS verification (~300K gas)
- **ZKP**: Off-chain BLS + ZK proof (~4K gas batched)

## Quick Links

### 📊 Want to Benchmark? (Main Goal)
```bash
cd source
./benchmark-comparison.sh
```
**Read**: `source/README.md`

---

### 🚀 Want to Get Started Quickly?
**Read**: `docs/technical/QUICKSTART.md` (30 minutes to running code)

---

### 🤔 Want to Understand ZK Approach?
**Read**: `docs/technical/aptos_zk_light_client.md`

**Answer**: Yes! BLS verification happens off-chain, only ZK proof verified on-chain.

---

### 💻 Want to Use Native Implementation?
```bash
cd source/diem-prover-native
npm install && npm test
```
**Read**: `source/diem-prover-native/README.md`

---

### 🔮 Want to Use ZKP Implementation?
```bash
cd source/diem-prover-zkp
npm install
npm run compile:circuits
npm run prover:build
npm test
```
**Read**: `source/diem-prover-zkp/README.md`

---

### 📚 Want All Documentation?
**Read**: `docs/technical/SUMMARY.md` (documentation index)

---

### 🎓 Want to Understand Aptos Proofs?
**Read**: `docs/technical/aptos_proof_systems_summary.md` (analyzed from source)

---

### 🏗️ Want Architecture Overview?
**Read**: `docs/technical/aptos_ethereum_bridge_implementation.md`

---

### 📈 Want Project Overview?
**Read**: `PROJECT_OVERVIEW.md`

---

### ✅ Want Implementation Status?
**Read**: `IMPLEMENTATION_SUMMARY.md`

---

## File Structure (Simplified)

```
atomica/
├── START_HERE.md              ← You are here
├── PROJECT_OVERVIEW.md        ← What we built
├── IMPLEMENTATION_SUMMARY.md  ← Status & results
│
├── source/                    ← ⭐ IMPLEMENTATIONS
│   ├── diem-prover-native/    ← Native Solidity
│   ├── diem-prover-zkp/       ← ZK-SNARK version
│   ├── README.md              ← Comparison guide
│   └── benchmark-comparison.sh ← Run this!
│
└── docs/technical/            ← 📚 DOCUMENTATION
    ├── QUICKSTART.md          ← Start here for learning
    ├── SUMMARY.md             ← Full doc index
    └── *.md                   ← Detailed guides
```

## Most Common Paths

### Path 1: "I want to benchmark both implementations"
1. Read: `source/README.md`
2. Run: `cd source && ./benchmark-comparison.sh`
3. Review: `source/benchmark-results-TIMESTAMP/comparison-report.md`

### Path 2: "I want to build a bridge"
1. Read: `docs/technical/QUICKSTART.md`
2. Choose: Native (simple) or ZKP (efficient)
3. Follow: Implementation-specific README
4. Deploy: `npm run deploy:local`

### Path 3: "I want to understand the tech"
1. Read: `docs/technical/aptos_proof_systems_summary.md`
2. Read: `docs/technical/aptos_zk_light_client.md`
3. Read: `source/diem-prover-zkp/README.md`
4. Explore: Circuit code in `circuits/`

### Path 4: "I just want to see it work"
```bash
cd source/diem-prover-native
npm install
npm test
```

## Key Question Answered

**Q: Can ZK proofs verify BLS signatures off-chain instead of on-chain aggregation?**

**A: YES!**

- **How**: BLS verification happens in ZK circuit (off-chain)
- **Proof**: Circuit generates ZK-SNARK proof of correct verification
- **On-chain**: Ethereum only verifies the proof (~250K gas)
- **Batching**: Can amortize to ~4K gas per update
- **Privacy**: Signatures never revealed on-chain

**Full details**: `docs/technical/aptos_zk_light_client.md`

## Need Help?

1. **Check READMEs**: Each directory has detailed guides
2. **Review docs**: `docs/technical/SUMMARY.md`
3. **Run tests**: Each implementation has test suites
4. **Check examples**: Example applications included

## Quick Commands

```bash
# Benchmark both implementations
cd source && ./benchmark-comparison.sh

# Test native
cd source/diem-prover-native && npm test

# Test ZKP
cd source/diem-prover-zkp && npm test

# Deploy native locally
cd source/diem-prover-native && npm run deploy:local

# Build ZKP prover
cd source/diem-prover-zkp && npm run prover:build
```

## What Next?

Choose your path:
- 📊 **Benchmark**: Run comparison script
- 🚀 **Build**: Follow QUICKSTART
- 🎓 **Learn**: Read technical docs
- 💻 **Code**: Explore implementations

**Most common**: Start with `source/README.md` then run benchmarks!

---

**Have fun exploring! 🎉**
