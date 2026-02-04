// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

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

    event TokensLocked(address indexed user, address indexed token, uint256 amount);

    constructor(address _fakeETH, address _fakeUSD) {
        fakeETH = _fakeETH;
        fakeUSD = _fakeUSD;
    }

    function lock(address token, uint256 amount) external {
        require(token == fakeETH || token == fakeUSD, "Invalid token");
        require(amount > 0, "Amount must be greater than 0");
        
        // Actually transfer tokens to this contract
        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Transfer failed");
        
        // Update locked balance
        lockedBalances[msg.sender][token] += amount;
        
        emit TokensLocked(msg.sender, token, amount);
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
