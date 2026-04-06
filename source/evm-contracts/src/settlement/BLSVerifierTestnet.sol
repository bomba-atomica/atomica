// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// BLSVerifierTestnet — v0.1 trusted-relayer stub
//
// PURPOSE
//   This contract replaces full BLS verification for the v0.1 testnet phase.
//   It accepts settlements from a single trusted EOA (the relayer) instead of
//   verifying an aggregated BLS12-381 signature.
//
// WHY THIS EXISTS
//   EIP-2537 (BLS12-381 precompiles) is not yet universally available on
//   public testnets.  The production verifier (BLSVerifier.sol) requires
//   precompiles 0x09 (G1_MULTIEXP) and 0x0c (PAIRING).  Once EIP-2537 is
//   confirmed stable this contract is retired and Settlement.sol switches its
//   verifier reference to BLSVerifier.sol.  No other Settlement logic changes.
//
// INTERFACE (see docs/architecture/v0-architecture.md §3.2)
//
//   authorizeSettlement(
//       uint64  windowId,
//       bytes32 pairHash,
//       uint64  clearingPrice,
//       address[] winners,
//       uint256[] fills
//   ) external
//
//   event SettlementAuthorized(
//       uint64  indexed windowId,
//       bytes32 indexed pairHash,
//       uint64  clearingPrice,
//       address[] winners,
//       uint256[] fills
//   )
//
// IMPLEMENTATION
//   Phase 3b.  Do not implement logic here until the Phase 3b issue is
//   selected from the Plan.
//
// SECURITY
//   The trusted relayer address is set at deployment and cannot be changed.
//   This is intentionally weaker than the v1 ZK-proof path.  See
//   docs/architecture/v0-architecture.md §3.4 for the v1 upgrade seam.
