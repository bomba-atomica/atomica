/**
 * Planned tests for the lock guard: the client refuses to approve or lock when
 * its LockBox or token address differs from the pin in `eth_proof`.
 */
import { describe, it } from "vitest";

describe("lock guard against the eth_proof pin (planned, SCOUT)", () => {
  it.todo(
    "SCOUT(#234) assertEthereumConfigMatchesPin resolves when the pinned addresses differ from the configured ones only in letter case",
  );
  it.todo(
    "SCOUT(#234) assertEthereumConfigMatchesPin throws an error that names the pinned address when the LockBox, FakeETH or FakeUSD address differs",
  );
  it.todo(
    "SCOUT(#234) assertEthereumConfigMatchesPin throws when the eth_proof::get_config view call rejects",
  );
  it.todo(
    "SCOUT(#234) approveFakeEth, lockFakeEth, approveFakeUsd and lockFakeUsd reject on a differing pin and send no contract call",
  );
});
