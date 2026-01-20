import { describe, expect, test } from "bun:test";
import { verifyReceiptProof, encodeReceipt } from "../src/receipt";
import type { Block, Receipt } from "../src/types";

describe("Receipt Verification", () => {
    test("should verify valid receipt proof", async () => {
        const receipt = {} as Receipt;
        const block = {} as Block;
        const siblings: Receipt[] = [];

        expect(verifyReceiptProof(receipt, block, siblings)).rejects.toThrow("Not implemented");
    });

    test("should encode receipt correctly", () => {
        const receipt = {} as Receipt;
        expect(() => encodeReceipt(receipt)).toThrow("Not implemented");
    });
});
