import type { ethers } from "ethers";

export interface TokenContract {
  mint(to: string, amount: bigint): Promise<ethers.ContractTransactionResponse>;
  approve(
    spender: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse>;
  balanceOf(account: string): Promise<bigint>;
  getAddress(): Promise<string>;
}

export interface LockBoxContract {
  lock(
    token: string,
    amount: bigint,
    windowId: bigint,
    pairHash: string,
    deadline: bigint,
  ): Promise<ethers.ContractTransactionResponse>;
  commitments(lockId: string): Promise<string>;
  statuses(lockId: string): Promise<bigint>;
  getAddress(): Promise<string>;
}
