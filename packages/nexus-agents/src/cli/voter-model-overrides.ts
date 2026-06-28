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
import type { VoterRole } from './vote-types.js';

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
