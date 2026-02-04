// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}

contract LockBox is Ownable {
    mapping(address user => mapping(address token => uint256 locked)) public lockedBalances;

    address public fakeETH;
    address public fakeUSD;

    constructor(address _fakeETH, address _fakeUSD) {
        fakeETH = _fakeETH;
        fakeUSD = _fakeUSD;
    }

    function lock(address token, uint256 amount) external {
        require(token == fakeETH || token == fakeUSD, "Invalid token");
        lockedBalances[msg.sender][token] += amount;
    }

    function getLockedBalance(address user, address token) external view returns (uint256) {
        return lockedBalances[user][token];
    }

    function calculateStorageKey(address user, address token) external pure returns (bytes32) {
        return _calculateStorageKey(user, token);
    }

    function _calculateStorageKey(address user, address token) internal pure returns (bytes32) {
        bytes32 innerKey = keccak256(abi.encode(token, uint256(0)));
        return keccak256(abi.encode(user, innerKey));
    }
}
