/**
 * Contract ABIs for FakeETH and FakeUSD tokens
 *
 * These ABIs define the interface for interacting with the ERC20 contracts
 */
// FakeETH ABI - ERC20 with mint function
export const FAKE_ETH_ABI = [
    // ERC20 Standard
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    // Events
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    // FakeETH Specific
    "function mint(address to, uint256 amount)",
    "function MAX_MINT_AMOUNT() view returns (uint256)",
];
// FakeUSD ABI - ERC20 with mint function and 6 decimals
export const FAKE_USD_ABI = [
    // ERC20 Standard
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    // Events
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    // FakeUSD Specific
    "function mint(address to, uint256 amount)",
    "function MAX_MINT_AMOUNT() view returns (uint256)",
];
//# sourceMappingURL=abis.js.map