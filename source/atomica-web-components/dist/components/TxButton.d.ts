import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
/**
 * Props for the TxButton component.
 */
interface TxButtonProps {
    /** The text label to display on the button (e.g., "Mint Token"). */
    label: string;
    /** The Aptos account address of the signer. */
    accountAddress: string;
    /**
     * Function to generate the transaction payload.
     * Can be synchronous or asynchronous.
     */
    prepareTransaction: () => Promise<InputGenerateTransactionPayloadData> | InputGenerateTransactionPayloadData;
    /** Callback fired when the transaction is successfully submitted. Receives the transaction hash. */
    onSuccess: (hash: string) => void;
    /** Optional CSS class name for styling the container. */
    className?: string;
    /** Whether the button is disabled. */
    disabled?: boolean;
}
/**
 * TxButton
 *
 * A comprehensive transaction submission button that manages the full transaction lifecycle
 * for Aptos interactions. It offers two modes of operation:
 *
 * 1. **Standard Flow** (Primary Button):
 *    - **Simulate**: First prepares and simulates the transaction to estimate gas and verify success.
 *    - **Review**: Displays simulation results (gas used, status).
 *    - **Submit**: Allows the user to confirm and submit the transaction after simulation.
 *
 * 2. **Skip & Submit Flow** (Dropdown Menu):
 *    - Accessed via the chevron dropdown.
 *    - **Skip Simulation**: Bypasses the simulation phase entirely.
 *    - **Direct Submit**: Immediately prepares and submits the transaction.
 *    - Useful for cases where simulation is unreliable or speed is prioritized.
 *
 * The component handles all internal states (idle, preparing, simulating, ready, submitting, success, error)
 * and provides visual feedback for each stage.
 */
export declare function TxButton({ label, accountAddress, prepareTransaction, onSuccess, className, disabled, }: TxButtonProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=TxButton.d.ts.map