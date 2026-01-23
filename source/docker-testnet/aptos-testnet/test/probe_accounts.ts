import { AptosClient, CoinClient } from "aptos";

async function probe() {
    const client = new AptosClient("http://localhost:8080");
    const coinClient = new CoinClient(client);

    const addresses = [
        "0x1",
        "0xa550c18",
        "0x8e29ddcdb41e6dc159f709444dab457e9bd23c67a4080e002ba103702e7d078c", // validator-0 from previous run
    ];

    for (const addr of addresses) {
        try {
            const resources = await client.getAccountResources(addr);
            console.log(
                `Account ${addr} resources:`,
                resources.map((r) => r.type),
            );
            const balance = await coinClient.checkBalance(addr).catch(() => "no balance");
            console.log(`Account ${addr} balance: ${balance}`);
        } catch (e) {
            console.log(`Account ${addr} not found or error: ${e.message}`);
        }
    }
}

probe();
