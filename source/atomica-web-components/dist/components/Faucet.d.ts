/**
 * Token faucet panel for the Atomica demo testnet.
 *
 * Lets the connected user request APT (via the Aptos docker testnet faucet),
 * FakeETH, and FakeUSD (via the Ethereum testnet faucet contracts). Disables
 * buttons until the respective testnet is detected as alive.
 *
 * Requires {@link WalletContext}, {@link BalancesContext}, and
 * {@link ContractStatusContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§1-package-layout
 */
export declare function Faucet(): import("react").JSX.Element;
//# sourceMappingURL=Faucet.d.ts.map