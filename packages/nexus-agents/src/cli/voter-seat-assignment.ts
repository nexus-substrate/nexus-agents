/**
 * Panel seat assignment for consensus voting.
 *
 * Assigns model adapters to voter roles across gateways or CLIs (#4040, #6003).
 * When multiple CLIs/gateways are available, distributes roles for model diversity.
 * When exactly one CLI is available, preserves that read-only-capable CLI (#7349).
 *
 * Split out of voter-agents.ts to maintain max-lines limit.
 * @module cli/voter-seat-assignment
 */

import type { IModelAdapter, ILogger } from '../core/index.js';
import type { CliName } from '../cli-adapters/types.js';
import { getGlobalRegistry } from '../adapters/unified-registry.js';
import { getAvailableClis } from '../cli-adapters/factory.js';
import { countDistinctModels } from '../config/model-equivalence.js';
import type { VoterRole } from './vote-types.js';
import { clisServingVoterSeats } from './voter-cli-access.js';
import { resolveVoterModelOverrides } from './voter-model-overrides.js';
import { dealSeatsAcrossFamilies, warnIfSingleFamily } from './voter-family-dealing.js';
import { reportPanelIndependence } from './panel-independence.js';

/** Options for assigning panel seats. */
export interface AssignPanelSeatsOptions {
  readonly roles: readonly VoterRole[];
  readonly adapter?: IModelAdapter | undefined;
  readonly gatewayAdapters?: readonly IModelAdapter[] | undefined;
  readonly roleAdapters?: ReadonlyMap<VoterRole, IModelAdapter> | undefined;
}

/** Assigns a single adapter to all roles (fallback path). */
export function assignUniformAdapter(
  roles: readonly VoterRole[],
  adapter: IModelAdapter
): Map<VoterRole, IModelAdapter> {
  return new Map(roles.map((role) => [role, adapter]));
}

/** Creates CLI-specific adapters for available CLIs via the unified registry. */
export function createCliAdapterMap(clis: readonly CliName[]): Map<CliName, IModelAdapter> {
  const registry = getGlobalRegistry();
  const result = new Map<CliName, IModelAdapter>();
  for (const cli of clis) result.set(cli, registry.getAdapterForCli(cli));
  return result;
}

/**
 * Round-robin assign roles across a labeled adapter list (the shared diversity
 * primitive for both the CLI path and the gateway path #4040). `label` is the
 * model/CLI id surfaced in the assignment log so operators can confirm which
 * model each role used.
 */
export function assignRoundRobinAdapters(
  roles: readonly VoterRole[],
  entries: readonly { readonly label: string; readonly adapter: IModelAdapter }[],
  logger: ILogger,
  source: string
): Map<VoterRole, IModelAdapter> {
  const adapters = new Map<VoterRole, IModelAdapter>();
  const assignments: Record<string, string> = {};
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const entry = entries[i % entries.length];
    if (role === undefined || entry === undefined) continue;
    adapters.set(role, entry.adapter);
    assignments[role] = entry.label;
  }
  logger.info('Diverse adapters assigned', {
    source,
    count: entries.length,
    roleAssignments: assignments,
  });
  return adapters;
}

/**
 * Gateway path (#4040): assign roles across the in-process per-model gateway
 * adapters. A single model collapses to a uniform panel (warned). With multiple
 * models, per-role operator overrides (#4055) pin chosen roles to a known-good
 * model and the rest are dealt across model FAMILIES first, then across models
 * within a family (#6606) — never in the gateway's listing order.
 */
export function resolveGatewayRoleAdapters(
  roles: readonly VoterRole[],
  gatewayAdapters: readonly IModelAdapter[],
  fallbackAdapter: IModelAdapter,
  logger: ILogger
): Map<VoterRole, IModelAdapter> {
  if (gatewayAdapters.length === 1) {
    if (roles.length > 1) {
      logger.warn('Consensus panel collapsed to a single gateway model — votes may correlate', {
        model: gatewayAdapters[0]?.modelId,
        roleCount: roles.length,
      });
    }
    return assignUniformAdapter(roles, gatewayAdapters[0] ?? fallbackAdapter);
  }
  const overrides = resolveVoterModelOverrides(roles, gatewayAdapters, logger);
  const dealtRoles = roles.filter((r) => !overrides.has(r));
  const dealt = dealSeatsAcrossFamilies(dealtRoles.length, gatewayAdapters, {
    seated: [...overrides.values()].map((a) => a.modelId),
  });
  const assigned = assignRoundRobinAdapters(
    dealtRoles,
    dealt.map((a) => ({ label: a.modelId, adapter: a })),
    logger,
    'gateway'
  );
  for (const [role, adapter] of overrides) assigned.set(role, adapter);
  const assignedModels = [...assigned.values()].map((a) => a.modelId);
  if (roles.length > 1 && countDistinctModels(assignedModels) === 1) {
    logger.warn(
      'Consensus panel collapsed to a single gateway model via overrides — votes may correlate',
      { model: assignedModels[0], roleCount: roles.length }
    );
  }
  warnIfSingleFamily(roles.length, assignedModels, logger);
  return assigned;
}

/**
 * Handles assignment when exactly one CLI adapter is available (#7349).
 * Preserves the single read-only-enforcing CLI rather than discarding it for
 * an unverified default/fallback adapter.
 */
function handleSingleCliAdapter(
  roles: readonly VoterRole[],
  cliAdapters: ReadonlyMap<CliName, IModelAdapter>,
  fallbackAdapter: IModelAdapter,
  logger: ILogger
): Map<VoterRole, IModelAdapter> {
  const [singleCli, singleAdapter] = [...cliAdapters.entries()][0] ?? [];
  const adapter = singleAdapter ?? fallbackAdapter;
  if (roles.length > 1) {
    logger.warn('Consensus panel collapsed to a single CLI adapter — votes may correlate', {
      cli: singleCli,
      roleCount: roles.length,
    });
  } else {
    logger.info('Using single adapter for all roles', { cliCount: 1, cli: singleCli });
  }
  return assignUniformAdapter(roles, adapter);
}

/** Resolves diverse per-role adapters across available CLIs or gateways. */
export async function resolveDiverseAdapters(
  roles: readonly VoterRole[],
  logger: ILogger,
  fallbackAdapter: IModelAdapter,
  gatewayAdapters?: readonly IModelAdapter[]
): Promise<Map<VoterRole, IModelAdapter>> {
  if (gatewayAdapters !== undefined && gatewayAdapters.length > 0) {
    return resolveGatewayRoleAdapters(roles, gatewayAdapters, fallbackAdapter, logger);
  }

  let availableClis: CliName[];
  try {
    availableClis = await getAvailableClis();
  } catch (e: unknown) {
    logger.warn('Failed to resolve available CLIs; falling back to single adapter', {
      error: String(e),
    });
    availableClis = [];
  }
  const access = clisServingVoterSeats(availableClis);
  if (access.refused.length > 0) {
    logger.info('CLIs excluded from voter seats: cannot enforce read-only analysis', {
      refused: access.refused,
    });
  }
  availableClis = access.serving;

  if (availableClis.length === 0) {
    logger.info('Using single adapter for all roles', { cliCount: 0 });
    return assignUniformAdapter(roles, fallbackAdapter);
  }

  const cliAdapters = createCliAdapterMap(availableClis);
  if (cliAdapters.size === 0) {
    logger.info('Using single adapter for all roles', { cliCount: 0 });
    return assignUniformAdapter(roles, fallbackAdapter);
  }

  if (cliAdapters.size === 1) {
    return handleSingleCliAdapter(roles, cliAdapters, fallbackAdapter, logger);
  }

  reportPanelIndependence([...cliAdapters.values()], roles.length, 'assignment', logger);

  return assignRoundRobinAdapters(
    roles,
    [...cliAdapters.entries()].map(([cli, adapter]) => ({ label: cli, adapter })),
    logger,
    'cli'
  );
}

/**
 * The panel's seat → adapter assignment — ONE definition, used by the vote and
 * by anything that must know the panel's models before it runs (#6003). An
 * explicit `adapter` is uniform (Issue #280); pre-resolved `roleAdapters` are
 * used verbatim; else roles spread across gateway models / CLIs (Issue #845).
 */
export async function assignPanelSeats(
  fallbackAdapter: IModelAdapter,
  options: AssignPanelSeatsOptions,
  logger: ILogger
): Promise<Map<VoterRole, IModelAdapter>> {
  if (options.adapter !== undefined) return assignUniformAdapter(options.roles, fallbackAdapter);
  if (options.roleAdapters !== undefined) return new Map(options.roleAdapters);
  return resolveDiverseAdapters(options.roles, logger, fallbackAdapter, options.gatewayAdapters);
}
