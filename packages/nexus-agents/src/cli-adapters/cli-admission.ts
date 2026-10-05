/**
 * The router's CLI admission predicate (#6720).
 *
 * `isCliAvailable` (factory) and `doctor` both decide from it whether a CLI
 * serves its own slot, so doctor cannot report "CLI" for a slot the router
 * sends to the gateway. A module of its own so modules that mock the factory
 * wholesale still reach the real predicate.
 *
 * @module cli-adapters/cli-admission
 */

import type { CliName, HealthStatus, ICliAdapter } from './types.js';
import { resolveAuthEvidence, type AuthEvidenceInput } from './auth-evidence.js';
import type { LevelOutcome } from '../cli/cli-readiness.js';
import { resolveClassGuardMs } from '../config/timeouts.js';
import { canonicalModelKey } from '../config/model-equivalence.js';

/** Live probe state belongs to an adapter instance and is discarded after settlement. */
const readinessFlights = new WeakMap<ICliAdapter, Promise<LevelOutcome>>();

/** Opt-in completion readiness, single-flight per instance and bounded by the interactive guard. */
export function adapterReadiness(
  adapter: ICliAdapter,
  options?: { readonly live?: boolean; readonly timeoutMs?: number }
): Promise<LevelOutcome> {
  if (options?.live !== true) {
    return Promise.resolve({
      status: 'not-attempted',
      reason: 'live completion probe was not requested',
    });
  }
  const existing = readinessFlights.get(adapter);
  if (existing !== undefined) return existing;
  const ceiling = resolveClassGuardMs('interactive');
  const requested = options.timeoutMs ?? ceiling;
  const timeoutMs =
    Number.isFinite(requested) && requested > 0 ? Math.min(requested, ceiling) : ceiling;
  const flight = import('../cli/cli-readiness.js')
    .then(({ probeServes }) => probeServes(adapter, timeoutMs))
    .finally(() => readinessFlights.delete(adapter));
  readinessFlights.set(adapter, flight);
  return flight;
}

/**
 * Positive catalog evidence, with unknown for absent, empty, failed or unlisted
 * models. Catalogs are incomplete, so absence cannot establish no. Codex's
 * vendor snapshot also requires an authoritative CLI registry entry.
 */
export async function servesListedModel(
  adapter: Pick<ICliAdapter, 'listModels'>,
  modelId: string,
  cli?: CliName
): Promise<'yes' | 'no' | 'unknown'> {
  if (modelId === '' || adapter.listModels === undefined) return 'unknown';
  try {
    const models = await adapter.listModels();
    if (models.length === 0) return 'unknown';
    const requestedKey = canonicalModelKey(modelId);
    const findCanonicalModel =
      cli === 'codex'
        ? (await import('../config/model-config-helpers.js')).findCanonicalModel
        : undefined;
    const requestedEntry =
      requestedKey === null ? findCanonicalModel?.('codex', modelId) : undefined;
    const listed = models.some((model) => {
      const listedEntry = findCanonicalModel?.('codex', model.id);
      if (cli === 'codex' && listedEntry === undefined) return false;
      return (
        model.id === modelId ||
        (requestedKey !== null && canonicalModelKey(model.id) === requestedKey) ||
        (requestedEntry !== undefined && requestedEntry.id === listedEntry?.id)
      );
    });
    return listed ? 'yes' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The auth probe determined the CLI cannot serve: logged out or not installed. */
export function cliAuthBlocks(auth: AuthEvidenceInput): boolean {
  return resolveAuthEvidence(auth).blocks;
}

/**
 * Whether a CLI with this health and auth probe is available to route to.
 *
 * #4391: `unknown` auth is ADMITTED, not excluded. Some gateways expose no
 * auth signal we can read — agy has no non-interactive auth check at all, and
 * its `models` subcommand hangs without a TTY (#4393). Treating an absence of
 * evidence as a failure is what excluded a working agy arm from routing
 * (#4346); treating it as success is how the retired gemini CLI stayed
 * selectable while failing every call (#4318). We admit it and let real
 * invocation failures do the excluding, via the circuit breaker the adapters
 * now feed (#4330).
 */
export function isCliAdmitted(
  health: Pick<HealthStatus, 'healthy'>,
  auth: AuthEvidenceInput
): boolean {
  return health.healthy && !resolveAuthEvidence(auth).blocks;
}
