import { ethers, Wallet } from 'ethers';
import { MockBLSKeyGenerator } from './MockBLSKeyGenerator';
import { MockStateProofGenerator } from './MockStateProofGenerator';
import { MockConsensusProofGenerator } from './MockConsensusProofGenerator';
import {
  BlockHeader,
  ConsensusProof,
  SettlementProof,
  AuctionConfig,
  MockContractInstances
} from './Types';

export class TestAuctionOrchestrator {
  private blsKeyGenerator: MockBLSKeyGenerator;
  private stateProofGenerator: MockStateProofGenerator;
  private consensusProofGenerator: MockConsensusProofGenerator;
  
  private contracts: MockContractInstances;

  constructor(contracts: MockContractInstances) {
    this.contracts = contracts;
    
    this.blsKeyGenerator = new MockBLSKeyGenerator();
    this.stateProofGenerator = new MockStateProofGenerator(
      contracts.depositBox.target as string
    );
    this.consensusProofGenerator = new MockConsensusProofGenerator(this.blsKeyGenerator);
  }

  async initializeSystem(): Promise<void> {
    const { privateKeys, publicKeys } = this.blsKeyGenerator.generateValidatorSet(4);
    
    const publicKeysCompressed = publicKeys.map(pk => this.compressPublicKey(pk));
    await this.contracts.blsVerifier.initialize(publicKeysCompressed);
    
    const genesisProof = this.consensusProofGenerator.createGenesisProof(
      ethers.ZeroHash,
      100
    );
    
    await this.contracts.governance.genesis(
      this.contracts.depositBox.target,
      this.contracts.blsVerifier.target,
      this.contracts.settlement.target,
      this.parseBlockNumber(genesisProof.blockHeader.number),
      genesisProof.blockHeader.stateRoot,
      this.bufferToHex(genesisProof.signature),
      genesisProof.validatorIndices
    );
  }

  async registerAuction(
    description: string,
    deadlineMicroseconds: number
  ): Promise<bigint> {
    const deadlineSeconds = Math.floor(deadlineMicroseconds / 1_000_000);
    
    const proof = this.consensusProofGenerator.createAuctionRegistrationProof(
      this.contracts.auctionRegistry.target as string,
      1n,
      deadlineSeconds,
      ethers.ZeroHash
    );

    const config: AuctionConfig = {
      nonce: 0,
      description,
      deadlineMicro: deadlineMicroseconds,
      minPrice: 0n,
      maxPrice: 0n,
      minEthAmount: 0n,
      minUsdcAmount: 0n,
    };

    const tx = await this.contracts.auctionRegistry.registerAuction(config);
    const receipt = await tx.wait();
    
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === 'AuctionRegistered'
    );
    
    return event?.args?.[0] ?? 1n;
  }

  async submitDeposit(
    auctionId: bigint,
    depositor: Wallet,
    amount: bigint,
    assetType: 'ETH' | 'USDC'
  ): Promise<{ nonce: bigint; storageKey: string }> {
    const nonce = BigInt(Date.now());
    
    if (assetType === 'ETH') {
      const tx = await this.contracts.depositBox
        .connect(depositor)
        ['depositETH(uint64,uint256)'](auctionId, nonce, { value: amount });
      await tx.wait();
    } else {
      const tx = await this.contracts.depositBox
        .connect(depositor)
        ['depositUSDC(uint64,uint256,uint256)'](auctionId, nonce, amount);
      await tx.wait();
    }
    
    const storageKey = ethers.solidityPackedKeccak256(
      ['uint64', 'address', 'uint256'],
      [auctionId, depositor.address, nonce]
    );
    
    return { nonce, storageKey };
  }

  async createSettlementProof(
    auctionId: bigint,
    winners: string[],
    amounts: bigint[],
    clearingPrice: bigint
  ): Promise<SettlementProof> {
    const { stateRoot } = this.stateProofGenerator.generateStateProof([]);
    
    return this.consensusProofGenerator.createSettlementProof(
      stateRoot,
      clearingPrice,
      winners,
      amounts
    );
  }

  async executeFullAuctionFlow(
    depositors: Wallet[],
    auctionConfig: { description: string; durationMs: number },
    assetType: 'ETH' | 'USDC',
    depositAmounts: bigint[],
    clearingPrice: bigint
  ): Promise<{ auctionId: bigint; nonces: bigint[]; winners: string[]; amounts: bigint[] }> {
    await this.initializeSystem();
    
    const deadlineMicro = Date.now() * 1000 + auctionConfig.durationMs * 1000;
    const auctionId = await this.registerAuction(auctionConfig.description, deadlineMicro);
    
    const nonces: bigint[] = [];
    const winners: string[] = [];
    const amounts: bigint[] = [];
    
    for (let i = 0; i < depositors.length; i++) {
      const { nonce } = await this.submitDeposit(
        auctionId,
        depositors[i],
        depositAmounts[i],
        assetType
      );
      nonces.push(nonce);
      winners.push(depositors[i].address);
      amounts.push(depositAmounts[i]);
    }

    const proof = await this.createSettlementProof(
      auctionId,
      winners,
      amounts,
      clearingPrice
    );

    return {
      auctionId,
      nonces,
      winners,
      amounts,
    };
  }

  getValidatorPublicKeys(): string[] {
    const { publicKeys } = this.blsKeyGenerator.getValidatorKeys();
    return publicKeys.map(pk => this.compressPublicKey(pk));
  }

  getStateProofGenerator(): MockStateProofGenerator {
    return this.stateProofGenerator;
  }

  getConsensusProofGenerator(): MockConsensusProofGenerator {
    return this.consensusProofGenerator;
  }

  private compressPublicKey(uncompressed: Uint8Array): string {
    return '0x' + Buffer.from(uncompressed).toString('hex');
  }

  private bufferToHex(buffer: Uint8Array): string {
    return '0x' + Buffer.from(buffer).toString('hex');
  }

  private parseBlockNumber(hexNumber: string): number {
    return parseInt(hexNumber, 16);
  }
}
