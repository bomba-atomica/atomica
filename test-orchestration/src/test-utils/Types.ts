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
