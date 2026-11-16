import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import {
  assertWindowSchedulesMatch,
  type WindowSchedule,
} from "@atomica/sdk/ethereum/lock-binding";

type AptosScheduleClient = Pick<Aptos, "view">;
type AptosScheduleClientFactory = (fullnode: string) => AptosScheduleClient;
type LockBoxScheduleClient = {
  windowSchedule(): Promise<unknown>;
};

export function createDemoAptosClient(fullnode: string): Aptos {
  return new Aptos(new AptosConfig({ network: Network.LOCAL, fullnode }));
}

export async function assertDemoDeploymentWindowSchedulesMatch(args: {
  aptosUrl: string;
  moduleAddress: string;
  expected: WindowSchedule;
  lockBox: LockBoxScheduleClient;
  createAptosClient?: AptosScheduleClientFactory;
}): Promise<void> {
  const aptos = (args.createAptosClient ?? createDemoAptosClient)(
    args.aptosUrl,
  );
  const [daySecs, offsets] = await aptos.view({
    payload: {
      function: `${args.moduleAddress}::eth_proof::get_window_schedule`,
      functionArguments: [],
    },
  });
  const aptosSchedule: WindowSchedule = {
    daySecs: BigInt(daySecs as string),
    closeOffsetsSecs: (offsets as string[]).map((offset) => BigInt(offset)),
  };
  const [lockBoxDaySecs, lockBoxOffsets] =
    (await args.lockBox.windowSchedule()) as [string, string[]];
  const lockBoxSchedule: WindowSchedule = {
    daySecs: BigInt(lockBoxDaySecs),
    closeOffsetsSecs: lockBoxOffsets.map((offset) => BigInt(offset)),
  };
  assertWindowSchedulesMatch(args.expected, lockBoxSchedule, aptosSchedule);
}
