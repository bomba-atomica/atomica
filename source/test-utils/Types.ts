// SCOUT(#239) REMOVE: whole file; nothing outside source/test-utils imports it, and no package.json, tsconfig or lint config covers this folder.
export interface BlockHeader {
  parentHash: string;
  uncleHash: string;
  coinbase: string;
  stateRoot: string;
  transactionsRoot: string;
  receiptsRoot: string;
  logsBloom: string;
  difficulty: string;
  number: string;
  gasLimit: string;
  gasUsed: string;
  timestamp: string;
  extraData: string;
  mixHash: string;
  nonce: string;
  baseFeePerGas: string;
  withdrawalsHash: string;
  blobGasUsed: string;
  excessBlobGas: string;
}

export interface EthereumProofResponse {
  address: string;
  balance: string;
  codeHash: string;
  nonce: string;
  storageHash: string;
  accountProof: string[];
  storageProof: StorageProof[];
}

export interface StorageProof {
  key: string;
  value: string;
  proof: string[];
}

export interface ConsensusProof {
  blockHeader: BlockHeader;
  signature: Uint8Array;
  validatorIndices: number[];
  publicKeys: Uint8Array[];
}

export interface SettlementProof extends ConsensusProof {
  tradeData: {
    clearingPrice: bigint;
    winners: string[];
    amounts: bigint[];
  };
}

export interface DepositState {
  auctionId: number;
  depositor: string;
  assetType: 'ETH' | 'USDC';
  amount: string;
  nonce: string;
  status: 'PENDING' | 'CONFIRMED' | 'SETTLED' | 'REFUNDED';
  timestamp: string;
}

export interface AuctionConfig {
  nonce: number;
  description: string;
  deadlineMicro: number;
  // SCOUT(#241) EDIT: this minPrice belongs to a mock config of an older EVM auction model, not to create_auction's min_price; it needs no edit once the removal issue (239) deletes this file.
  minPrice: bigint;
  maxPrice: bigint;
  minEthAmount: bigint;
  minUsdcAmount: bigint;
}

export interface ValidatorKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface ValidatorSet {
  privateKeys: Uint8Array[];
  publicKeys: Uint8Array[];
}

export interface GenesisProof {
  stateRoot: string;
  blockHeader: BlockHeader;
  proof: EthereumProofResponse;
}

export interface AuctionRegistrationProof {
  auctionId: bigint;
  deadlineSeconds: number;
  stateRoot: string;
  blockHeader: BlockHeader;
  signature: Uint8Array;
}

export interface MockContractInstances {
  governance: any;
  auctionRegistry: any;
  depositBox: any;
  blsVerifier: any;
  settlement: any;
  usdcToken: any;
}
