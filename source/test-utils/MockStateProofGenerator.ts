import { ethers } from 'ethers';
import { EthereumProofResponse, StorageProof, BlockHeader, DepositState } from './Types';

export class MockStateProofGenerator {
  private depositBoxAddress: string;
  private deposits: Map<string, DepositState> = new Map();
  private storageRoot: string;

  constructor(depositBoxAddress: string) {
    this.depositBoxAddress = depositBoxAddress;
    this.storageRoot = this.randomHash();
  }

  createDeposit(
    auctionId: bigint,
    depositor: string,
    nonce: bigint,
    amount: bigint,
    assetType: 'ETH' | 'USDC'
  ): string {
    const storageKey = this.computeStorageKey(auctionId, depositor, nonce);
    
    const deposit: DepositState = {
      auctionId: Number(auctionId),
      depositor,
      assetType,
      amount: amount.toString(),
      nonce: nonce.toString(),
      status: 'PENDING',
      timestamp: Math.floor(Date.now() / 1000).toString(),
    };
    
    this.deposits.set(storageKey, deposit);
    this.updateStorageRoot();
    
    return storageKey;
  }

  generateProof(
    storageKeys: string[],
    blockNumber: number
  ): EthereumProofResponse {
    const accountProof = this.generateAccountProof();
    const storageProofs = storageKeys.map((key) =>
      this.generateStorageProof(key)
    );

    return {
      address: this.depositBoxAddress,
      balance: '0x0',
      codeHash: this.computeCodeHash(),
      nonce: '0x0',
      storageHash: this.storageRoot,
      accountProof: [accountProof],
      storageProof: storageProofs,
    };
  }

  generateGenesisStateRoot(): { stateRoot: string; blockHeader: BlockHeader; proof: EthereumProofResponse } {
    const blockNumber = 100;
    const storageKeys: string[] = [];

    const proof = this.generateProof(storageKeys, blockNumber);
    const stateRoot = proof.storageHash;

    const blockHeader: BlockHeader = {
      parentHash: this.randomHash(),
      uncleHash: this.randomHash(),
      coinbase: this.depositBoxAddress,
      stateRoot,
      transactionsRoot: this.randomHash(),
      receiptsRoot: this.randomHash(),
      logsBloom: this.randomBloom(),
      difficulty: '0x0',
      number: `0x${blockNumber.toString(16)}`,
      gasLimit: '0x1c9c380',
      gasUsed: '0x0',
      timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`,
      extraData: '0x',
      mixHash: this.randomHash(),
      nonce: '0x0000000000000000',
      baseFeePerGas: '0x0',
      withdrawalsHash: this.randomHash(),
      blobGasUsed: '0x0',
      excessBlobGas: '0x0',
    };

    return { stateRoot, blockHeader, proof };
  }

  generateStateRootWithDeposits(
    deposits: Array<{ auctionId: bigint; depositor: string; nonce: bigint; amount: bigint; assetType: 'ETH' | 'USDC' }>
  ): { stateRoot: string; blockHeader: BlockHeader; proof: EthereumProofResponse } {
    const storageKeys: string[] = [];
    
    for (const deposit of deposits) {
      const key = this.createDeposit(
        deposit.auctionId,
        deposit.depositor,
        deposit.nonce,
        deposit.amount,
        deposit.assetType
      );
      storageKeys.push(key);
    }

    return this.generateStateProof(storageKeys);
  }

  generateStateProof(
    storageKeys: string[]
  ): { stateRoot: string; blockHeader: BlockHeader; proof: EthereumProofResponse } {
    const blockNumber = 100 + this.deposits.size;
    const proof = this.generateProof(storageKeys, blockNumber);
    const stateRoot = proof.storageHash;

    const blockHeader: BlockHeader = {
      parentHash: this.randomHash(),
      uncleHash: this.randomHash(),
      coinbase: this.depositBoxAddress,
      stateRoot,
      transactionsRoot: this.randomHash(),
      receiptsRoot: this.randomHash(),
      logsBloom: this.randomBloom(),
      difficulty: '0x0',
      number: `0x${blockNumber.toString(16)}`,
      gasLimit: '0x1c9c380',
      gasUsed: '0x0',
      timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`,
      extraData: '0x',
      mixHash: this.randomHash(),
      nonce: '0x0000000000000000',
      baseFeePerGas: '0x0',
      withdrawalsHash: this.randomHash(),
      blobGasUsed: '0x0',
      excessBlobGas: '0x0',
    };

    return { stateRoot, blockHeader, proof };
  }

  getDeposit(storageKey: string): DepositState | undefined {
    return this.deposits.get(storageKey);
  }

  getAllDeposits(): DepositState[] {
    return Array.from(this.deposits.values());
  }

  clearDeposits(): void {
    this.deposits.clear();
    this.storageRoot = this.randomHash();
  }

  private computeStorageKey(auctionId: bigint, depositor: string, nonce: bigint): string {
    const encoded = ethers.solidityPacked(
      ['uint64', 'address', 'uint256'],
      [auctionId, depositor, nonce]
    );
    return ethers.keccak256(encoded);
  }

  private generateAccountProof(): string {
    return '0x' + '00'.repeat(500);
  }

  private generateStorageProof(storageKey: string): StorageProof {
    const deposit = this.deposits.get(storageKey);
    return {
      key: storageKey,
      value: this.encodeDeposit(deposit),
      proof: ['0x' + '00'.repeat(256)],
    };
  }

  private encodeDeposit(deposit?: DepositState): string {
    if (!deposit) return '0x';
    
    const assetTypeVal = deposit.assetType === 'ETH' ? 0 : 1;
    const statusVal = this.statusToInt(deposit.status);
    
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ['tuple(uint64 auctionId, address depositor, uint8 assetType, uint256 amount, uint256 nonce, uint8 status, uint256 timestamp)'],
      [[
        deposit.auctionId,
        deposit.depositor,
        assetTypeVal,
        deposit.amount,
        deposit.nonce,
        statusVal,
        deposit.timestamp
      ]]
    );
  }

  private statusToInt(status: string): number {
    switch (status) {
      case 'PENDING': return 0;
      case 'CONFIRMED': return 1;
      case 'SETTLED': return 2;
      case 'REFUNDED': return 3;
      default: return 0;
    }
  }

  private updateStorageRoot(): void {
    this.storageRoot = this.randomHash();
  }

  private randomHash(): string {
    return ethers.keccak256(ethers.randomBytes(32));
  }

  private randomBloom(): string {
    return '0x' + '00'.repeat(256);
  }

  private computeCodeHash(): string {
    return ethers.keccak256('0x');
  }
}
