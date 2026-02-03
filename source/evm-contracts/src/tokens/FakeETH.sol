// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title FakeETH
 * @notice A test token simulating Ethereum for development and testing
 * @dev Uses 18 decimals to match real ETH. Maximum mint of 10,000 FAKETH per transaction.
 */
contract FakeETH is ERC20 {
    /// @notice Maximum amount that can be minted in a single transaction
    uint256 public constant MAX_MINT_AMOUNT = 10_000 ether;

    constructor() ERC20("Fake Ethereum", "FAKETH") {}

    /**
     * @notice Mint new FAKETH tokens
     * @param to Address to receive the minted tokens
     * @param amount Amount of tokens to mint (in wei, 18 decimals)
     * @dev Anyone can call this function. Limited to MAX_MINT_AMOUNT per call.
     */
    function mint(address to, uint256 amount) external {
        require(amount <= MAX_MINT_AMOUNT, "Mint amount exceeds maximum limit");
        _mint(to, amount);
    }
}
