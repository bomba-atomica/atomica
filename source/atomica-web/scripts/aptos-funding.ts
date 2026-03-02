import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import {
  AptosAccount,
  AptosClient,
  BCS,
  HexString,
  TxnBuilderTypes,
} from "aptos";

const DEFAULT_FUNDING_AMOUNT = 100_000_000;
const MAX_FUNDING_AMOUNT = 10_000_000_000;
const DEFAULT_FAUCET_ADDRESS =
  "0x00000000000000000000000000000000000000000000000000000000a550c18";

const ROOT_KEY_FILE_CANDIDATES = [
  "../docker-testnet/config/genesis-artifacts/root-account-private-keys.yaml",
  "docker-testnet/config/genesis-artifacts/root-account-private-keys.yaml",
  "source/docker-testnet/config/genesis-artifacts/root-account-private-keys.yaml",
  "../../docker-testnet/config/genesis-artifacts/root-account-private-keys.yaml",
];

const BALANCE_CONFIRM_RETRIES = 40;
const BALANCE_CONFIRM_DELAY_MS = 1_000;

type FundingRequest = {
  address: string;
  amount?: number;
  host?: string;
};

export type FundingResponse = {
  txHash: string;
  fundedAddress: string;
  amount: number;
  fullnodeUrl: string;
};

function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    throw new Error(`Invalid Aptos address: ${address}`);
  }
  const hex = trimmed.slice(2);
  if (hex.length === 0 || hex.length > 64) {
    throw new Error(`Invalid Aptos address length: ${address}`);
  }
  return `0x${hex.padStart(64, "0")}`.toLowerCase();
}

function normalizeAmount(amount?: number): number {
  if (amount === undefined) {
    return DEFAULT_FUNDING_AMOUNT;
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Funding amount must be a positive integer.");
  }
  if (amount > MAX_FUNDING_AMOUNT) {
    throw new Error(
      `Funding amount exceeds max (${MAX_FUNDING_AMOUNT} octas).`,
    );
  }
  return amount;
}

function parseHostUrl(target: string): URL {
  const trimmed = target.trim();
  if (!trimmed) {
    return new URL("http://localhost");
  }
  if (trimmed.includes("://")) {
    return new URL(trimmed);
  }
  return new URL(`http://${trimmed}`);
}

function buildAptosRestUrl(host: string): string {
  const url = parseHostUrl(host);
  if (!url.port) {
    url.port = "8080";
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseYamlPrivateKey(yaml: string): string | null {
  const match = yaml.match(/account_private_key:\s*"?(0x[a-fA-F0-9]+)"?/);
  return match?.[1] ?? null;
}

function findRootPrivateKey(): string {
  const candidates = ROOT_KEY_FILE_CANDIDATES.map((p) =>
    pathResolve(process.cwd(), p),
  );

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseYamlPrivateKey(content);
    if (parsed) {
      return parsed;
    }
  }

  throw new Error(
    "No Aptos funder private key found in docker-testnet genesis artifacts.",
  );
}

function getFunderAccount(): AptosAccount {
  const privateKeyHex = findRootPrivateKey().replace(/^0x/, "");
  const faucetAddress =
    process.env.ATOMICA_APTOS_FUNDER_ADDRESS?.trim() || DEFAULT_FAUCET_ADDRESS;
  return new AptosAccount(
    HexString.ensure(privateKeyHex).toUint8Array(),
    normalizeAddress(faucetAddress),
  );
}

export async function fundAptosAccount(
  request: FundingRequest,
): Promise<FundingResponse> {
  const fundedAddress = normalizeAddress(request.address);
  const amount = normalizeAmount(request.amount);
  const host =
    request.host?.trim() || process.env.ATOMICA_APTOS_HOST || "localhost";
  const fullnodeUrl = buildAptosRestUrl(host);

  const funder = getFunderAccount();
  const client = new AptosClient(fullnodeUrl);

  const payload = new TxnBuilderTypes.TransactionPayloadEntryFunction(
    TxnBuilderTypes.EntryFunction.natural(
      "0x1::aptos_account",
      "transfer",
      [],
      [
        BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(fundedAddress)),
        BCS.bcsSerializeUint64(BigInt(amount)),
      ],
    ),
  );

  const accountInfo = await client.getAccount(funder.address());
  const chainId = await client.getChainId();

  const rawTxn = new TxnBuilderTypes.RawTransaction(
    TxnBuilderTypes.AccountAddress.fromHex(funder.address()),
    BigInt(accountInfo.sequence_number),
    payload,
    BigInt(10_000),
    BigInt(100),
    BigInt(Math.floor(Date.now() / 1000) + 600),
    new TxnBuilderTypes.ChainId(chainId),
  );

  const signedTxn = await client.signTransaction(funder, rawTxn);
  const submitted = await client.submitTransaction(signedTxn);
  await client.waitForTransaction(submitted.hash, { timeoutSecs: 60 });
  await waitForBalance(client, fundedAddress, amount);

  return {
    txHash: submitted.hash,
    fundedAddress,
    amount,
    fullnodeUrl,
  };
}

async function waitForBalance(
  client: AptosClient,
  address: string,
  expected: number,
) {
  const target = BigInt(expected);
  for (let attempt = 0; attempt < BALANCE_CONFIRM_RETRIES; attempt++) {
    try {
      const balanceView = await client.view({
        function: "0x1::coin::balance",
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: [address],
      });
      if (balanceView && balanceView.length > 0) {
        const value = BigInt(balanceView[0] as string);
        if (value >= target) {
          return;
        }
      }
    } catch (error) {
      console.warn("Balance confirmation failed, retrying", error);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, BALANCE_CONFIRM_DELAY_MS),
    );
  }
  console.warn("Failed to confirm Apt balance after funding", address);
}
