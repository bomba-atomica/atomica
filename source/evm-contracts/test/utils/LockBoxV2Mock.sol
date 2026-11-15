// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LockBox} from "../../src/escrow/LockBox.sol";

contract LockBoxV2Mock is LockBox {
    function version() external pure returns (uint256) {
        return 2;
    }
}
