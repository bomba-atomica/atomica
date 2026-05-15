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
//   verifyBlockHash(bytes32 blockHash, bytes calldata sig) returns (bool)
//     Trusted-relayer check: returns true iff msg.sender == trustedRelayer.
//     No real BLS math.
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
// SECURITY
//   The trusted relayer address is set at deployment and cannot be changed.
//   This is intentionally weaker than the v1 ZK-proof path.  See
//   docs/architecture/v0-architecture.md §3.4 for the v1 upgrade seam.
//
// ADR (v0.1)
//   Settlement.sol currently imports BLSVerifier.sol for its `blsVerifier`
//   reference (see Settlement.sol line ~44).  In testnet deployments, deploy
//   BLSVerifierTestnet at the address passed to Settlement's constructor so
//   Settlement routes through this contract without code changes.  The
//   interface is compatible: both expose `verifyBlockHash`.

/**
 * @title BLSVerifierTestnet
 * @notice Trusted-relayer stub for v0.1 testnet settlement verification.
 * @dev Replaces real BLS12-381 math with a simple msg.sender check.
 *      Retire and switch to BLSVerifier.sol once EIP-2537 is stable.
 *      Ref: docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 *      Ref: issue #83 (Phase 0b — original stub), issue #89 (Phase 3d — impl)
 */
contract BLSVerifierTestnet {
    // ─── State ────────────────────────────────────────────────────────────────

    /**
     * @notice The single trusted EOA allowed to authorize settlements.
     * @dev Set at construction; immutable — cannot be changed.
     */
    address public immutable trustedRelayer;

    // ─── Events ───────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when the trusted relayer successfully authorizes a settlement.
     * @param windowId  Auction window identifier.
     * @param pairHash  keccak256 of the BCS-encoded trading pair.
     * @param clearingPrice Uniform clearing price (in quote-token base units).
     * @param winners   Ethereum addresses of auction winners.
     * @param fills     Fill amounts (in base-token wei) for each winner.
     */
    event SettlementAuthorized(
        uint64  indexed windowId,
        bytes32 indexed pairHash,
        uint64  clearingPrice,
        address[] winners,
        uint256[] fills
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    /// @notice Caller is not the trusted relayer.
    error NotTrustedRelayer(address caller);

    /// @notice winners and fills arrays have different lengths.
    error WinnersFillesMismatch(uint256 winnersLen, uint256 fillsLen);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _trustedRelayer EOA address of the off-chain settlement relayer.
     */
    constructor(address _trustedRelayer) {
        require(_trustedRelayer != address(0), "BLSVerifierTestnet: zero relayer");
        trustedRelayer = _trustedRelayer;
    }

    // ─── External functions ───────────────────────────────────────────────────

    /**
     * @notice Trusted-relayer replacement for BLS block-hash verification.
     * @dev Returns true iff msg.sender is the trustedRelayer.  The `sig`
     *      parameter is accepted for interface compatibility but ignored.
     * @param blockHash  Block hash being "verified" (accepted for parity with BLSVerifier).
     * @param sig        Ignored.  Present for interface compatibility.
     * @return True if msg.sender == trustedRelayer, false otherwise.
     */
    function verifyBlockHash(
        bytes32 blockHash,
        bytes calldata sig
    ) external view returns (bool) {
        // Suppress unused-variable warnings without omitting parameter names
        // (parameter names kept for ABI readability).
        blockHash;
        sig;
        return msg.sender == trustedRelayer;
    }

    /**
     * @notice Authorize a settlement batch.
     * @dev Only callable by the trustedRelayer.  Emits SettlementAuthorized.
     * @param windowId      Auction window identifier.
     * @param pairHash      keccak256 of the BCS-encoded trading pair.
     * @param clearingPrice Uniform clearing price (quote-token base units).
     * @param winners       Ethereum addresses of auction winners.
     * @param fills         Fill amounts (base-token wei) for each winner.
     */
    function authorizeSettlement(
        uint64  windowId,
        bytes32 pairHash,
        uint64  clearingPrice,
        address[] calldata winners,
        uint256[] calldata fills
    ) external {
        if (msg.sender != trustedRelayer) {
            revert NotTrustedRelayer(msg.sender);
        }
        if (winners.length != fills.length) {
            revert WinnersFillesMismatch(winners.length, fills.length);
        }

        emit SettlementAuthorized(windowId, pairHash, clearingPrice, winners, fills);
    }
}
