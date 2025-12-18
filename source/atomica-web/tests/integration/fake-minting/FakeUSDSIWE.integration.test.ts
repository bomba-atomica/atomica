// SIWE integration test for FakeUSD using Secp256k1 signing
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setupLocalnet, teardownLocalnet, fundAccount, deployContracts } from "../../setup/localnet";
import { getDerivedAddress } from "../../../src/lib/aptos/siwe";
import { submitNativeTransaction } from "../../../src/lib/aptos/transaction";
import { ethers } from "ethers";
import { generateTestingUtils } from "eth-testing";

const DEPLOYER_ADDR = "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
const TEST_ACCOUNT = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"; // Hardhat Account 0
const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe.sequential("FakeUSD SIWE Integration Test (Secp256k1)", () => {
    let aptos: Aptos;
    let wallet: ethers.Wallet;
    const testingUtils = generateTestingUtils({ providerType: "MetaMask" });

    beforeAll(async () => {
        console.log("Starting Localnet...");
        await setupLocalnet();

        // Initialize Aptos client
        const config = new AptosConfig({
            network: Network.LOCAL,
            fullnode: "http://127.0.0.1:8080/v1",
        });
        aptos = new Aptos(config);

        // Deploy contracts
        console.log("Deploying contracts...");
        await deployContracts();

        // Initialize Ethereum wallet
        wallet = new ethers.Wallet(TEST_PK);
        console.log(`Ethereum Address: ${TEST_ACCOUNT}`);

        // Derive Aptos address from Ethereum address
        const derivedAddr = await getDerivedAddress(TEST_ACCOUNT.toLowerCase());
        console.log(`Derived Aptos Address: ${derivedAddr.toString()}`);

        // Fund the derived account with APT for gas
        await fundAccount(derivedAddr.toString(), 100_000_000); // 1 APT

        // Wait for funding to be indexed
        await new Promise(r => setTimeout(r, 2000));

        // Mock window.ethereum for SIWE flow
        (window as any).ethereum = testingUtils.getProvider();

        // Mock window.location
        // @ts-ignore
        delete window.location;
        // @ts-ignore
        window.location = {
            protocol: "http:",
            host: "localhost:3000",
            origin: "http://localhost:3000",
            href: "http://localhost:3000/"
        };

        // Setup Mock Provider
        testingUtils.mockChainId("0x4");
        testingUtils.mockAccounts([TEST_ACCOUNT]);
        testingUtils.mockRequestAccounts([TEST_ACCOUNT]);

        // Mock personal_sign to return real signature
        testingUtils.lowLevel.mockRequest("personal_sign", async (params: any[]) => {
            const [msgHex, from] = params;
            const msgStr = ethers.toUtf8String(msgHex);
            console.log(`[Mock] Signing SIWE message...`);
            return await wallet.signMessage(msgStr);
        });

        console.log("SIWE environment setup complete");
    }, 120000);

    afterAll(async () => {
        console.log("Stopping Localnet...");
        await teardownLocalnet();
        testingUtils.clearAllMocks();
    });

    it("should mint FakeUSD using SIWE authentication", async () => {
        const mintAmount = 10000000; // 10 FAKEUSD (6 decimals)
        const derivedAddr = await getDerivedAddress(TEST_ACCOUNT.toLowerCase());

        console.log("Submitting FakeUSD mint transaction with SIWE...");

        // Submit transaction using SIWE flow
        const result = await submitNativeTransaction(TEST_ACCOUNT, {
            function: `${DEPLOYER_ADDR}::FAKEUSD::mint`,
            functionArguments: [mintAmount],
        });

        console.log(`Transaction Hash: ${result.hash}`);
        expect(result.hash).toBeDefined();

        // Wait for transaction to be committed
        const txInfo = await aptos.waitForTransaction({
            transactionHash: result.hash
        });

        console.log("Transaction committed:", txInfo.success);
        expect(txInfo.success).toBe(true);

        // Verify balance
        const balance = await aptos.getAccountCoinAmount({
            accountAddress: derivedAddr.toString(),
            coinType: `${DEPLOYER_ADDR}::FAKEUSD::FAKEUSD`,
        });

        console.log(`FAKEUSD Balance: ${balance}`);
        expect(balance).toBe(mintAmount);
    }, 60000);

    it("should verify Secp256k1 signature in transaction", async () => {
        const mintAmount = 5000000; // 5 FAKEUSD
        const derivedAddr = await getDerivedAddress(TEST_ACCOUNT.toLowerCase());

        // Get initial balance
        let initialBalance = 0;
        try {
            initialBalance = await aptos.getAccountCoinAmount({
                accountAddress: derivedAddr.toString(),
                coinType: `${DEPLOYER_ADDR}::FAKEUSD::FAKEUSD`,
            });
        } catch (e) {
            // Account might not have FAKEUSD yet
        }

        console.log(`Initial Balance: ${initialBalance}`);

        // Submit transaction
        const result = await submitNativeTransaction(TEST_ACCOUNT, {
            function: `${DEPLOYER_ADDR}::FAKEUSD::mint`,
            functionArguments: [mintAmount],
        });

        await aptos.waitForTransaction({ transactionHash: result.hash });

        // Verify balance increased
        const finalBalance = await aptos.getAccountCoinAmount({
            accountAddress: derivedAddr.toString(),
            coinType: `${DEPLOYER_ADDR}::FAKEUSD::FAKEUSD`,
        });

        console.log(`Final Balance: ${finalBalance}`);
        expect(finalBalance).toBe(initialBalance + mintAmount);
    }, 60000);

    it("should handle multiple SIWE-signed mints", async () => {
        const derivedAddr = await getDerivedAddress(TEST_ACCOUNT.toLowerCase());

        // Get initial balance
        const initialBalance = await aptos.getAccountCoinAmount({
            accountAddress: derivedAddr.toString(),
            coinType: `${DEPLOYER_ADDR}::FAKEUSD::FAKEUSD`,
        });

        const mints = [2000000, 3000000, 1000000]; // 2, 3, 1 FAKEUSD
        const totalMint = mints.reduce((a, b) => a + b, 0);

        // Submit multiple mints
        for (const amount of mints) {
            const result = await submitNativeTransaction(TEST_ACCOUNT, {
                function: `${DEPLOYER_ADDR}::FAKEUSD::mint`,
                functionArguments: [amount],
            });
            await aptos.waitForTransaction({ transactionHash: result.hash });
        }

        // Verify accumulated balance
        const finalBalance = await aptos.getAccountCoinAmount({
            accountAddress: derivedAddr.toString(),
            coinType: `${DEPLOYER_ADDR}::FAKEUSD::FAKEUSD`,
        });

        expect(finalBalance).toBe(initialBalance + totalMint);
    }, 90000);
});
