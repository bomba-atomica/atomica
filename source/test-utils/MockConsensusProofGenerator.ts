import { ethers } from 'ethers';
import { MockBLSKeyGenerator } from './MockBLSKeyGenerator';
import { BlockHeader, ConsensusProof, SettlementProof } from './Types';

export class MockConsensusProofGenerator {
  private keyGenerator: MockBLSKeyGenerator;
  private blockHeaders: Map<string, BlockHeader> = new Map();

  constructor(keyGenerator?: MockBLSKeyGenerator) {
    this.keyGenerator = keyGenerator ?? new MockBLSKeyGenerator();
  }

  createGenesisProof(
    stateRoot: string,
    blockNumber: number = 100
  ): ConsensusProof {
    const blockHeader = this.createBlockHeader(stateRoot, blockNumber);
    const { privateKeys } = this.keyGenerator.getValidatorKeys();
    
    const signature = this.aggregateSignatures(
      privateKeys.map((priv) => this.signBlock(priv, blockHeader))
    );

    const { publicKeys } = this.keyGenerator.getValidatorKeys();

    return {
      blockHeader,
      signature,
      validatorIndices: publicKeys.map((_, i) => i),
      publicKeys,
    };
  }

  createAuctionRegistrationProof(
    auctionRegistryAddress: string,
    auctionId: bigint,
    deadlineSeconds: number,
    stateRoot: string
  ): ConsensusProof {
    const blockNumber = 100 + Number(auctionId);
    const blockHeader = this.createBlockHeader(stateRoot, blockNumber);
    
    const message = this.hashAuctionRegistration(auctionRegistryAddress, auctionId, deadlineSeconds);
    const { privateKeys, publicKeys } = this.keyGenerator.getValidatorKeys();
    
    const signature = this.aggregateSignatures(
      privateKeys.map((priv) => this.signMessage(priv, message))
    );

    return {
      blockHeader,
      signature,
      validatorIndices: publicKeys.map((_, i) => i),
      publicKeys,
    };
  }

  createSettlementProof(
    stateRoot: string,
    clearingPrice: bigint,
    winners: string[],
    amounts: bigint[],
    blockNumber: number = 200
  ): SettlementProof {
    const blockHeader = this.createBlockHeader(stateRoot, blockNumber);
    
    const message = this.hashSettlement(stateRoot, clearingPrice, winners, amounts);
    const { privateKeys, publicKeys } = this.keyGenerator.getValidatorKeys();
    
    const signature = this.aggregateSignatures(
      privateKeys.map((priv) => this.signMessage(priv, message))
    );

    return {
      blockHeader,
      signature,
      validatorIndices: publicKeys.map((_, i) => i),
      publicKeys,
      tradeData: {
        clearingPrice,
        winners,
        amounts,
      },
    };
  }

  createValidatorUpdateProof(
    newPublicKeys: Uint8Array[],
    newEpoch: number,
    stateRoot: string
  ): ConsensusProof {
    const blockNumber = 1000 + newEpoch;
    const blockHeader = this.createBlockHeader(stateRoot, blockNumber);
    
    const message = this.hashValidatorUpdate(newEpoch, newPublicKeys);
    const { privateKeys, publicKeys: oldPublicKeys } = this.keyGenerator.getValidatorKeys();
    
    const signature = this.aggregateSignatures(
      privateKeys.map((priv) => this.signMessage(priv, message))
    );

    return {
      blockHeader,
      signature,
      validatorIndices: oldPublicKeys.map((_, i) => i),
      publicKeys: oldPublicKeys,
    };
  }

  createCustomProof(
    message: Uint8Array,
    stateRoot: string,
    blockNumber: number
  ): ConsensusProof {
    const blockHeader = this.createBlockHeader(stateRoot, blockNumber);
    const { privateKeys, publicKeys } = this.keyGenerator.getValidatorKeys();
    
    const signature = this.aggregateSignatures(
      privateKeys.map((priv) => this.signMessage(priv, message))
    );

    return {
      blockHeader,
      signature,
      validatorIndices: publicKeys.map((_, i) => i),
      publicKeys,
    };
  }

  createBlockHeader(
    stateRoot: string,
    blockNumber: number,
    customFields?: Partial<BlockHeader>
  ): BlockHeader {
    const timestamp = Math.floor(Date.now() / 1000);
    
    const header: BlockHeader = {
      parentHash: ethers.keccak256(ethers.randomBytes(32)),
      uncleHash: ethers.keccak256(ethers.randomBytes(32)),
      coinbase: ethers.ZeroAddress,
      stateRoot,
      transactionsRoot: ethers.keccak256(ethers.randomBytes(32)),
      receiptsRoot: ethers.keccak256(ethers.randomBytes(32)),
      logsBloom: '0x' + '00'.repeat(256),
      difficulty: '0x0',
      number: `0x${blockNumber.toString(16)}`,
      gasLimit: '0x1c9c380',
      gasUsed: '0x0',
      timestamp: `0x${timestamp.toString(16)}`,
      extraData: '0x',
      mixHash: ethers.keccak256(ethers.randomBytes(32)),
      nonce: '0x0000000000000000',
      baseFeePerGas: '0x0',
      withdrawalsHash: ethers.keccak256(ethers.randomBytes(32)),
      blobGasUsed: '0x0',
      excessBlobGas: '0x0',
      ...customFields,
    };

    this.blockHeaders.set(header.number, header);
    return header;
  }

  getKeyGenerator(): MockBLSKeyGenerator {
    return this.keyGenerator;
  }

  setValidators(count: number): void {
    this.keyGenerator = new MockBLSKeyGenerator();
    this.keyGenerator.generateValidatorSet(count);
  }

  private signBlock(privateKey: Uint8Array, header: BlockHeader): Uint8Array {
    const headerHash = this.hashBlockHeader(header);
    return this.keyGenerator.sign(privateKey, headerHash);
  }

  private signMessage(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
    return this.keyGenerator.sign(privateKey, message);
  }

  private aggregateSignatures(signatures: Uint8Array[]): Uint8Array {
    return this.keyGenerator.aggregateSignatures(signatures);
  }

  private hashBlockHeader(header: BlockHeader): Uint8Array {
    const encoded = this.encodeBlockHeader(header);
    return ethers.getBytes(ethers.keccak256(encoded));
  }

  private hashAuctionRegistration(
    registry: string,
    auctionId: bigint,
    deadline: number
  ): Uint8Array {
    return ethers.getBytes(
      ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint64', 'uint64'],
          [registry, auctionId, BigInt(deadline)]
        )
      )
    );
  }

  private hashSettlement(
    stateRoot: string,
    clearingPrice: bigint,
    winners: string[],
    amounts: bigint[]
  ): Uint8Array {
    return ethers.getBytes(
      ethers.keccak256(
        ethers.solidityPacked(
          ['bytes32', 'uint256', 'address[]', 'uint256[]'],
          [stateRoot, clearingPrice, winners, amounts]
        )
      )
    );
  }

  private hashValidatorUpdate(
    epoch: number,
    newPublicKeys: Uint8Array[]
  ): Uint8Array {
    const pubkeysHash = ethers.keccak256(
      '0x' + newPublicKeys.map(k => Buffer.from(k).toString('hex')).join('')
    );
    
    return ethers.getBytes(
      ethers.keccak256(
        ethers.solidityPacked(
          ['string', 'uint64', 'bytes32'],
          ['ATOMICA_VALIDATOR_UPDATE', BigInt(epoch), pubkeysHash]
        )
      )
    );
  }

  private encodeBlockHeader(header: BlockHeader): string {
    return ethers.solidityPacked(
      [
        'bytes32', 'bytes32', 'address', 'bytes32', 'bytes32', 'bytes32',
        'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint64',
        'bytes32', 'uint64', 'uint64', 'uint64'
      ],
      [
        header.parentHash,
        header.uncleHash,
        header.coinbase,
        header.stateRoot,
        header.transactionsRoot,
        header.receiptsRoot,
        header.logsBloom,
        header.difficulty,
        header.number,
        header.gasLimit,
        header.gasUsed,
        header.timestamp,
        header.extraData,
        header.baseFeePerGas,
        header.withdrawalsHash,
        header.blobGasUsed
      ]
    );
  }
}
