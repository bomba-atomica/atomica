/**
 * LockBox Contract Helpers
 *
 * Ethereum-side interactions for locking FakeETH/FakeUSD in LockBox.sol.
 * Covers approve → lock → query → withdraw lifecycle.
 */
import { ethers } from "ethers";
import { getChainConfig } from "../chain-config.js";
import { FAKE_ETH_ABI } from "./abis.js";
// ── ABI ──────────────────────────────────────────────────────────────────────
const LOCKBOX_ABI = [
    "function lock(address token, uint256 amount) external",
    "function withdraw(address token, uint256 amount) external",
    "function getLockedBalance(address user, address token) external view returns (uint256)",
    "function getUnlockTime(address user, address token) external view returns (uint256)",
    "function isUnlocked(address user, address token) external view returns (bool)",
    "event TokensLocked(address indexed user, address indexed token, uint256 amount, uint256 unlockTime)",
    "event TokensWithdrawn(address indexed user, address indexed token, uint256 amount)",
];
// ── Helpers ───────────────────────────────────────────────────────────────────
function getLockBoxAddress() {
    return getChainConfig().ethereum.lockBox;
}
function getFakeEthAddress() {
    return getChainConfig().ethereum.fakeETH;
}
/**
 * Get a LockBox contract instance with a MetaMask signer attached.
 */
async function getLockBoxWithSigner(provider) {
    const signer = await provider.getSigner();
    const address = getLockBoxAddress();
    return new ethers.Contract(address, LOCKBOX_ABI, signer);
}
/**
 * Get a FakeETH ERC-20 contract instance with a MetaMask signer attached.
 */
async function getFakeEthWithSigner(provider) {
    const signer = await provider.getSigner();
    const address = getFakeEthAddress();
    return new ethers.Contract(address, FAKE_ETH_ABI, signer);
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Approve LockBox to spend `amount` of FakeETH on the user's behalf.
 *
 * This must be called before `lockFakeEth` if the current allowance is
 * insufficient.
 */
export async function approveFakeEth(provider, amount) {
    const fakeEth = await getFakeEthWithSigner(provider);
    const lockBoxAddress = getLockBoxAddress();
    const tx = await fakeEth.approve(lockBoxAddress, amount);
    const receipt = await tx.wait();
    if (!receipt)
        throw new Error("approve() tx receipt is null");
    return receipt;
}
/**
 * Lock `amount` of FakeETH in LockBox.
 *
 * The caller must have approved LockBox for at least `amount` first.
 */
export async function lockFakeEth(provider, amount) {
    const lockBox = await getLockBoxWithSigner(provider);
    const tokenAddress = getFakeEthAddress();
    const tx = await lockBox.lock(tokenAddress, amount);
    const receipt = await tx.wait();
    if (!receipt)
        throw new Error("lock() tx receipt is null");
    return receipt;
}
/**
 * Get the FakeETH amount currently locked by `userAddress` in LockBox.
 */
export async function getLockedBalance(provider, userAddress) {
    const lockBoxAddress = getLockBoxAddress();
    const tokenAddress = getFakeEthAddress();
    const contract = new ethers.Contract(lockBoxAddress, LOCKBOX_ABI, provider);
    return contract.getLockedBalance(userAddress, tokenAddress);
}
/**
 * Get the Unix timestamp (seconds) after which the user can withdraw.
 * Returns 0 if no tokens are locked.
 */
export async function getUnlockTime(provider, userAddress) {
    const lockBoxAddress = getLockBoxAddress();
    const tokenAddress = getFakeEthAddress();
    const contract = new ethers.Contract(lockBoxAddress, LOCKBOX_ABI, provider);
    const ts = await contract.getUnlockTime(userAddress, tokenAddress);
    return Number(ts);
}
/**
 * Check whether the user's tokens are past their lock period.
 */
export async function isUnlocked(provider, userAddress) {
    const lockBoxAddress = getLockBoxAddress();
    const tokenAddress = getFakeEthAddress();
    const contract = new ethers.Contract(lockBoxAddress, LOCKBOX_ABI, provider);
    return contract.isUnlocked(userAddress, tokenAddress);
}
/**
 * Withdraw `amount` of previously locked FakeETH.
 * Will revert on-chain if the unlock time has not passed.
 */
export async function withdrawFakeEth(provider, amount) {
    const lockBox = await getLockBoxWithSigner(provider);
    const tokenAddress = getFakeEthAddress();
    const tx = await lockBox.withdraw(tokenAddress, amount);
    const receipt = await tx.wait();
    if (!receipt)
        throw new Error("withdraw() tx receipt is null");
    return receipt;
}
/**
 * Get the FakeETH allowance the user has granted to LockBox.
 */
export async function getLockBoxAllowance(provider, userAddress) {
    const fakeEthAddress = getFakeEthAddress();
    const lockBoxAddress = getLockBoxAddress();
    const contract = new ethers.Contract(fakeEthAddress, FAKE_ETH_ABI, provider);
    return contract.allowance(userAddress, lockBoxAddress);
}
/**
 * Get total FakeETH locked by all users in LockBox.
 * Queries all TokensLocked events and sums the amounts.
 */
export async function getTotalLockedEth(provider) {
    const lockBoxAddress = getLockBoxAddress();
    const tokenAddress = getFakeEthAddress();
    const contract = new ethers.Contract(lockBoxAddress, LOCKBOX_ABI, provider);
    const filter = contract.filters.TokensLocked(null, tokenAddress, null, null);
    const events = await contract.queryFilter(filter);
    let total = 0n;
    for (const event of events) {
        const amount = event.args
            .amount;
        total += amount;
    }
    return total;
}
