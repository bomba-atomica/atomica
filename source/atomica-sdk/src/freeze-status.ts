import { Contract, type ContractRunner } from "ethers";
import type { Aptos } from "@aptos-labs/ts-sdk";

const LOCKBOX_FREEZE_ABI = ["function frozen() view returns (bool)"];
const PACKAGE_REGISTRY = "0x1::code::PackageRegistry";
const ATOMICA_PACKAGE_NAME = "AtomicaAuction";
const IMMUTABLE_UPGRADE_POLICY = 2;

type MoveString = string | { vec: number[] };

interface PackageMetadata {
  name: MoveString;
  upgrade_policy: { policy: number | string };
}

interface PackageRegistry {
  packages: PackageMetadata[];
}

function moveString(value: MoveString): string {
  if (typeof value === "string") return value;
  return new TextDecoder().decode(new Uint8Array(value.vec));
}

/** Read whether the Atomica Move package has immutable upgrade policy (policy 2). */
export async function moveFreezeStatus(
  aptos: Aptos,
  packageAddress: string,
): Promise<boolean> {
  const registry = await aptos.getAccountResource<PackageRegistry>({
    accountAddress: packageAddress,
    resourceType: PACKAGE_REGISTRY,
  });
  const atomica = registry.packages.find(
    (pkg) => moveString(pkg.name) === ATOMICA_PACKAGE_NAME,
  );
  if (!atomica) {
    throw new Error(
      `PackageRegistry at ${packageAddress} has no ${ATOMICA_PACKAGE_NAME} package`,
    );
  }
  return Number(atomica.upgrade_policy.policy) === IMMUTABLE_UPGRADE_POLICY;
}

/** Read whether the LockBox proxy's one-way UUPS freeze has been called. */
export async function evmFreezeStatus(
  runner: ContractRunner,
  lockBoxProxyAddress: string,
): Promise<boolean> {
  const lockBox = new Contract(lockBoxProxyAddress, LOCKBOX_FREEZE_ABI, runner);
  return Boolean(await lockBox.frozen());
}
