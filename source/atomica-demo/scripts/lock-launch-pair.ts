export interface LockLaunchPairDependencies<Result> {
  pairBcs: Uint8Array;
  pairHash: string;
  isPairAllowed(pairBcs: Uint8Array): Promise<boolean>;
  mint(): Promise<void>;
  approve(): Promise<void>;
  lock(pairHash: string): Promise<Result>;
}

export async function assertPairAllowed(
  pairBcs: Uint8Array,
  isPairAllowed: (pairBcs: Uint8Array) => Promise<boolean>,
): Promise<void> {
  let allowed: boolean;
  try {
    allowed = await isPairAllowed(pairBcs);
  } catch (error) {
    throw new Error("Launch pair is not listed on Aptos", { cause: error });
  }
  if (!allowed) {
    throw new Error("Launch pair is not listed on Aptos");
  }
}

export async function lockLaunchPair<Result>(
  dependencies: LockLaunchPairDependencies<Result>,
): Promise<Result> {
  await assertPairAllowed(dependencies.pairBcs, dependencies.isPairAllowed);
  await dependencies.mint();
  await dependencies.approve();
  return dependencies.lock(dependencies.pairHash);
}
