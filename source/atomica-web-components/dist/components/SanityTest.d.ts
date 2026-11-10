/**
 * Developer diagnostic component for verifying SIWE signature flow end-to-end.
 *
 * Executes a minimal APT transfer to confirm that address derivation,
 * SIWE message construction, and transaction submission all work correctly.
 * Only enabled when the account has APT balance.
 *
 * Requires {@link WalletContext} and {@link BalancesContext} to be mounted above.
 *
 * @see docs/architecture/v0-architecture.md#§1-package-layout
 */
export declare function SanityTest(): import("react").JSX.Element;
//# sourceMappingURL=SanityTest.d.ts.map