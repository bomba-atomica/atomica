/**
 * Ethereum Light Client Sync Protocol
 *
 * Trustless block header verification using beacon chain sync committee.
 *
 * @example
 * ```typescript
 * import { initializeLightClient, fetchLightClientBootstrap, processLightClientUpdate } from './beacon';
 *
 * // Initialize from bootstrap
 * const bootstrap = await fetchLightClientBootstrap(apiUrl, checkpointRoot);
 * const state = initializeLightClient(bootstrap.header, bootstrap.currentSyncCommittee, period);
 *
 * // Process updates
 * const update = await fetchLightClientUpdates(apiUrl, period, 1);
 * const newState = await processLightClientUpdate(state, update[0], false);
 *
 * // Get trusted state roots
 * const roots = getTrustedStateRoots(newState);
 * ```
 */

export * from "./types";
export {
  fetchLightClientBootstrap,
  fetchLightClientUpdates,
  fetchLightClientFinalityUpdate,
  fetchLightClientOptimisticUpdate,
  BEACON_CONFIGS,
  computeSyncCommitteePeriod,
} from "./fetch";

export {
  initializeLightClient,
  processLightClientUpdate,
  verifySyncCommitteeSignature,
  verifyBlsSignature,
  hasSyncCommitteeQuorum,
  getTrustedStateRoots,
} from "./sync";

export {
  createInitialState,
  updateState,
  isUpdateNewer,
  transitionPeriod,
  serializeState,
  deserializeState,
  saveState,
  loadState,
  clearState,
} from "./state";
