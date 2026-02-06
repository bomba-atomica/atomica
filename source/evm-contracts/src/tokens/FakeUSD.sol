// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title FakeUSD
 * @notice A test token simulating USD stablecoin (USDC) for development and testing
 * @dev Uses 6 decimals to match real USDC. Maximum mint of 10,000 FAKEUSD per transaction.
 */
contract FakeUSD is ERC20 {
    /// @notice Maximum amount that can be minted in a single transaction
    /// @dev 10,000 USD with 6 decimals = 10,000,000,000
    uint256 public constant MAX_MINT_AMOUNT = 10_000 * 10**6;

    constructor() ERC20("Fake USD", "FAKEUSD") {}

    /**
     * @notice Returns the number of decimals used by the token
     * @return uint8 Number of decimals (6, matching USDC)
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Mint new FAKEUSD tokens
     * @param to Address to receive the minted tokens
     * @param amount Amount of tokens to mint (in smallest units, 6 decimals)
     * @dev Anyone can call this function. Limited to MAX_MINT_AMOUNT per call.
     */
    function mint(address to, uint256 amount) external {
        require(amount <= MAX_MINT_AMOUNT, "Mint amount exceeds maximum limit");
        _mint(to, amount);
    }
}
