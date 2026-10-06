/**
 * Gateway model catalogue (#4392 increment 2, step 2).
 *
 * A gateway registers as ONE `api:<endpoint>` arm fronting every model it
 * lists (`adapters/gateway-arm-adapter.ts`), so the arm id alone cannot say
 * which model a request will hit. The catalogue is the registration-time
 * record of what the arm fronts, keyed by arm id, and it exists for one
 * consumer: bare `priced` in `NEXUS_GATEWAY_COST` defers to REGISTRY pricing,
 * and `estimateArmCostUsd` needs a model to look up — before this it priced
 * the arm's display slot (opencode's default model), a number that measured
 * nothing about the gateway.
 *
 * Process-wide by design, like the adapter registry that holds the arm: set
 * once at server bootstrap (`cli-server-gateway.ts` `registerGatewayArm`),
 * read by the cost estimators, cleared when its last wrapper is disposed.
 * Absent is a real value: without a catalogue or resolved model, bare `priced`
 * stays unresolved and admission fails closed; no CLI display slot substitutes.
 *
 * @module adapters/sdk/gateway-catalog
 */

import type { EndpointArmId } from '../../cli-adapters/types-core.js';

const catalogs = new Map<EndpointArmId, readonly string[]>();
const owners = new Map<EndpointArmId, Set<object>>();

/** Retain the catalogue for a live wrapper, including wrappers in separate registries. */
export function retainGatewayCatalog(arm: EndpointArmId, owner: object): void {
  let retained = owners.get(arm);
  if (retained === undefined) {
    retained = new Set<object>();
    owners.set(arm, retained);
  }
  retained.add(owner);
}

/** Release only a known owner; stale or repeated disposals cannot erase a newer catalogue. */
export function releaseGatewayCatalog(arm: EndpointArmId, owner: object): void {
  const retained = owners.get(arm);
  if (retained?.delete(owner) !== true) return;
  if (retained.size > 0) return;
  owners.delete(arm);
  clearGatewayCatalog(arm);
}

/**
 * Record the model ids `arm` fronts, in the gateway's listing order (the
 * first remains the legacy fallback pricing model; execution resolves the
 * ranked default through resolveGatewayDefault). Replaces an
 * earlier catalogue for the same arm, mirroring `registerApiArm`. Throws on an
 * empty list: an empty catalogue is not a catalogue, and storing one would
 * make `catalog[0]` an undefined pricing key.
 */
export function setGatewayCatalog(arm: EndpointArmId, modelIds: readonly string[]): void {
  if (modelIds.length === 0) {
    throw new Error(
      `Gateway catalogue for ${arm} is empty; an arm with no model is not registrable`
    );
  }
  catalogs.set(arm, [...modelIds]);
}

/** The model ids `arm` fronts, or `undefined` when no catalogue was set for it. */
export function getGatewayCatalog(arm: EndpointArmId): readonly string[] | undefined {
  return catalogs.get(arm);
}

/**
 * Forget `arm`'s catalogue. The last live wrapper's release calls this, so
 * independent registry disposal cannot erase another live wrapper's metadata.
 * Absent is already a real value here, so clearing an unknown arm is a no-op.
 */
export function clearGatewayCatalog(arm: EndpointArmId): void {
  catalogs.delete(arm);
}

/** Test-only: forget every catalogue so suites do not leak into each other. */
export function _resetGatewayCatalogs(): void {
  catalogs.clear();
  owners.clear();
}
