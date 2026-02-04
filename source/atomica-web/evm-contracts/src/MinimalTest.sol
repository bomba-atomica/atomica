// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MinimalTest - Simplest possible contract for testing deployment
 *
 * This contract has no constructor logic, no inheritance, and minimal storage.
 * If this fails to deploy, the issue is with the testnet/EVM setup.
 * If this succeeds but FakeETH fails, the issue is with FakeETH's constructor.
 */
contract MinimalTest {
    uint256 public value = 42;

    function getValue() external view returns (uint256) {
        return value;
    }
}
