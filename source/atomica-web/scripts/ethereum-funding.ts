import { ethers } from "ethers";
import {
  ETHEREUM_DEPLOYER_PRIVATE_KEY,
  ETHEREUM_DEPLOYER_ADDRESS,
} from "../../shared/test-constants";

const FAKE_ETH_ABI = [
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
] as const;

const FAKE_USD_ABI = [
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
] as const;

const DEFAULT_FAKE_ETH_AMOUNT = 10n * 10n ** 18n; // 10 FakeETH
const DEFAULT_FAKE_USD_AMOUNT = 10_000n * 10n ** 6n; // 10,000 FakeUSD

export type EthFundingRequest = {
  recipientAddress: string;
  fakeETHAddress: string;
  fakeUSDAddress: string;
  rpcUrl?: string;
  host?: string;
};

export type EthFundingResponse = {
  ethTxHash: string;
  usdTxHash: string;
  recipientAddress: string;
};

function buildRpcUrl(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return "http://localhost:8545";
  if (trimmed.includes("://")) {
    const url = new URL(trimmed);
    if (!url.port) url.port = "8545";
    return url.toString();
  }
  return `http://${trimmed}:8545`;
}

function validateAddress(address: string, label: string): string {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid ${label}: ${address}`);
  }
  return address;
}

export async function fundEthereumAccount(
  request: EthFundingRequest,
): Promise<EthFundingResponse> {
  const recipientAddress = validateAddress(
    request.recipientAddress,
    "recipient address",
  );
  const fakeETHAddress = validateAddress(
    request.fakeETHAddress,
    "FakeETH contract address",
  );
  const fakeUSDAddress = validateAddress(
    request.fakeUSDAddress,
    "FakeUSD contract address",
  );

  const host =
    request.rpcUrl ||
    (request.host
      ? buildRpcUrl(request.host)
      : process.env.ATOMICA_ETH_HOST
        ? buildRpcUrl(process.env.ATOMICA_ETH_HOST)
        : "http://localhost:8545");

  const provider = new ethers.JsonRpcProvider(
    host.includes("://") ? host : `http://${host}`,
  );
  const funder = new ethers.Wallet(ETHEREUM_DEPLOYER_PRIVATE_KEY, provider);

  console.log(
    `[eth-fund] Funder: ${ETHEREUM_DEPLOYER_ADDRESS}, Recipient: ${recipientAddress}`,
  );
  console.log(`[eth-fund] RPC: ${host}`);

  const fakeETH = new ethers.Contract(fakeETHAddress, FAKE_ETH_ABI, funder);
  const fakeUSD = new ethers.Contract(fakeUSDAddress, FAKE_USD_ABI, funder);

  const ethTx = await (
    fakeETH.mint as (to: string, amount: bigint) => Promise<ethers.TransactionResponse>
  )(recipientAddress, DEFAULT_FAKE_ETH_AMOUNT);
  await ethTx.wait();
  console.log(`[eth-fund] FakeETH minted, tx: ${ethTx.hash}`);

  const usdTx = await (
    fakeUSD.mint as (to: string, amount: bigint) => Promise<ethers.TransactionResponse>
  )(recipientAddress, DEFAULT_FAKE_USD_AMOUNT);
  await usdTx.wait();
  console.log(`[eth-fund] FakeUSD minted, tx: ${usdTx.hash}`);

  return {
    ethTxHash: ethTx.hash,
    usdTxHash: usdTx.hash,
    recipientAddress,
  };
}
