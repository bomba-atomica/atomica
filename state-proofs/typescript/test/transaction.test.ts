import { describe, expect, test } from "bun:test";
import { verifyTransactionProof, encodeTransaction } from "../src/transaction";
import type { Block, Transaction } from "../src/types";

describe("Transaction Verification", () => {
    test("should verify valid transaction proof", async () => {
        // Stub data
        const transaction = {} as Transaction;
        const block = {} as Block;
        const siblings: Transaction[] = [];

        // Expect not implemented yet
        expect(verifyTransactionProof(transaction, block, siblings)).rejects.toThrow("Not implemented");
    });

    test("should encode legacy transaction correctly", () => {
        const tx = { type: "0x0" } as Transaction;
        expect(() => encodeTransaction(tx)).toThrow("Not implemented");
    });

    test("should encode EIP-1559 transaction correctly", () => {
        const tx = { type: "0x2" } as Transaction;
        expect(() => encodeTransaction(tx)).toThrow("Not implemented");
    });
});
