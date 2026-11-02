// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Smallest deployable contract, used by the Ethereum testnet SDK's
/// minimal-deployment test to prove the chain stores deployed bytecode.
/// It lives under test/ so it never ships with the protocol contracts.
contract MinimalTest {
    uint256 public value = 42;

    function getValue() external view returns (uint256) {
        return value;
    }
}
