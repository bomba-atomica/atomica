import type { LockedBalanceProof } from "@atomica/sdk/ethereum/proofs";
interface Props {
    proof?: LockedBalanceProof;
    loading: boolean;
    error?: string;
    onGenerate: () => Promise<void>;
}
export declare function Step4Proof({ proof, loading, error, onGenerate }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Step4Proof.d.ts.map