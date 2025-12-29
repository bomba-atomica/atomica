import { AptosClient } from "aptos";

async function probe() {
    const client = new AptosClient("http://localhost:8080");
    try {
        const resource = await client.getAccountResource("0x1", "0x1::stake::ValidatorSet");
        console.log("Validator Set:", JSON.stringify(resource.data, null, 2));
    } catch (e) {
        console.log("Error fetching validator set:", e.message);
    }
}

probe();
