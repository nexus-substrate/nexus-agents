/**
 * nexus-agents/cli — per-role voter model overrides (#4055).
 *
 * Voters round-robin across the gateway's discovered models (#4040), so a role can
 * land on a model that fails on a particular gateway (e.g. a bodyless HTTP 400 for
 * specific model ids — #4049). This lets an operator PIN a known-good gateway model
 * for a role:
 *
 *   NEXUS_VOTER_MODEL_<ROLE>=<bare gateway model id>
 *   e.g. NEXUS_VOTER_MODEL_ARCHITECT=claude_4_5_opus
 *
 * The override is validated against the discovered gateway catalog: an id that is
 * NOT a live gateway model warns and falls back to round-robin for that role (no
 * hard failure). Roles without an override round-robin unchanged.
 *
 * @module cli/voter-model-overrides
 */

import type { ILogger, IModelAdapter } from '../core/index.js';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import type { CollectRealVotesOptions } from './voter-agents.js';
import { hasGatewaySlotCatalog, resolveGatewayDefault } from '../adapters/gateway-family-slots.js';
import { preserveVoterAttemptTelemetry } from './voter-attempt-events.js';

/** Env var name for a role's voter-model override (e.g. role `ai_ml` → `NEXUS_VOTER_MODEL_AI_ML`). */
export function voterModelOverrideEnvKey(role: VoterRole): string {
  return `NEXUS_VOTER_MODEL_${role.toUpperCase()}`;
}

/**
 * Resolve per-role gateway-model overrides from the environment, validated against
 * the discovered gateway adapters. Returns a map of ONLY the roles that have a
 * valid override (matched to a live gateway model by `modelId`); roles with no
 * override, or an override id not in the catalog, are omitted (and the latter is
 * warned) so the caller round-robins them as usual.
 *
 * Matching is exact on `modelId` first, then case-insensitive as a convenience.
 */
export function resolveVoterModelOverrides(
  roles: readonly VoterRole[],
  gatewayAdapters: readonly IModelAdapter[],
  logger: ILogger
): Map<VoterRole, IModelAdapter> {
  const overrides = new Map<VoterRole, IModelAdapter>();
  if (gatewayAdapters.length === 0) return overrides;

  const byId = new Map<string, IModelAdapter>();
  for (const adapter of gatewayAdapters) byId.set(adapter.modelId, adapter);

  for (const role of roles) {
    const envKey = voterModelOverrideEnvKey(role);
    const raw = process.env[envKey];
    if (raw === undefined || raw.trim() === '') continue;
    const requested = raw.trim();

    const adapter =
      byId.get(requested) ??
      gatewayAdapters.find((a) => a.modelId.toLowerCase() === requested.toLowerCase());

    if (adapter === undefined) {
      logger.warn(
        `Voter model override ${envKey}="${requested}" is not a discovered gateway model — ` +
          `falling back to round-robin for role "${role}".`,
        { role, requested, available: [...byId.keys()] }
      );
      continue;
    }
    overrides.set(role, adapter);
  }

  if (overrides.size > 0) {
    logger.info('Applied per-role voter model overrides (#4055)', {
      overrides: Object.fromEntries([...overrides].map(([r, a]) => [r, a.modelId])),
    });
  }
  return overrides;
}

/** Why a role pin cannot affect the current panel's assignment. */
function ignoredRolePinReason(
  requested: string,
  options: Pick<CollectRealVotesOptions, 'adapter' | 'roleAdapters' | 'gatewayAdapters'>
): string | undefined {
  const gateway = options.gatewayAdapters ?? [];
  if (gateway.length === 0) {
    return hasGatewaySlotCatalog()
      ? 'gateway model dealing is inactive for this panel'
      : 'no gateway active';
  }
  if (options.adapter !== undefined) return 'an explicit adapter overrides gateway dealing';
  if (options.roleAdapters !== undefined) return 'the roster was assigned before this call';
  if (gateway.length === 1) return 'single-model gateway: role pins have no effect';
  if (!gateway.some((a) => a.modelId.toLowerCase() === requested.toLowerCase())) {
    return 'not in the gateway catalog; the seat was dealt instead';
  }
  return undefined;
}

/** An unknown default pin, including a registered gateway reached via the registry. */
function ignoredCustomPin(gateway: readonly IModelAdapter[]): string | undefined {
  const requested = process.env['NEXUS_CUSTOM_MODEL']?.trim();
  if (requested === undefined || requested === '') return undefined;
  if (gateway.length > 0) {
    if (gateway.some((a) => a.modelId === requested)) return undefined;
  } else {
    const resolved = resolveGatewayDefault();
    if (
      resolved.kind === 'inactive' ||
      (resolved.kind === 'resolved' && resolved.via === 'override')
    ) {
      return undefined;
    }
  }
  return `NEXUS_CUSTOM_MODEL="${requested}" ignored: not in the gateway catalog`;
}

/**
 * Snapshot ignored pins before execution, then disclose each seat's actual
 * primary assignment on its final result. Routing and retry behavior stay unchanged.
 * An empty roster creates no warnings; blank pins are unset.
 */
export function captureModelPinWarnings(
  options: Pick<CollectRealVotesOptions, 'roles' | 'adapter' | 'roleAdapters' | 'gatewayAdapters'>
): (vote: AgentVoteResult) => AgentVoteResult {
  const ignored = new Map<VoterRole, string>();
  const custom = ignoredCustomPin(options.gatewayAdapters ?? []);
  for (const role of options.roles) {
    const key = voterModelOverrideEnvKey(role);
    const requested = process.env[key]?.trim();
    let roleWarning: string | undefined;
    if (requested !== undefined && requested !== '') {
      const reason = ignoredRolePinReason(requested, options);
      if (reason !== undefined) roleWarning = `${key}="${requested}" ignored: ${reason}`;
    }
    const warning = [roleWarning, custom].filter((w) => w !== undefined).join('; ');
    if (warning !== '') ignored.set(role, warning);
  }
  return (vote) => {
    const warning = ignored.get(vote.role);
    if (warning === undefined) return vote;
    return preserveVoterAttemptTelemetry(vote, {
      ...vote,
      modelPinWarning: `${warning}; role "${vote.role}" assigned model "${vote.pinnedModel ?? 'unresolved'}".`,
    });
  };
}
