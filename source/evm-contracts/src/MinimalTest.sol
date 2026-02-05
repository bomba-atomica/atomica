// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MinimalTest {
    uint256 public value = 42;

    function getValue() external view returns (uint256) {
        return value;
    }
}
