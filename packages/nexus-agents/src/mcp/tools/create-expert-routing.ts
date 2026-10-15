/**
 * Expert CLI routing helpers for create_expert tool.
 *
 * Resolves the optimal CLI adapter for expert creation based on:
 * 1. Explicit model preference (Issue #827)
 * 2. Task specialization matrix auto-routing (Issue #858)
 * 3. Fallback to default adapter
 *
 * Delegates to UnifiedAdapterRegistry for centralized, cached routing.
 * (Source: Issue #1149 — Unified Adapter Registry)
 *
 * @module mcp/tools/create-expert-routing
 */

import type { ILogger } from '../../core/index.js';
import type { ExecutionAccessMode, IModelAdapter, Result } from '../../core/index.js';
import { ok, err } from '../../core/index.js';
import { queryModelAccessMode } from '../../adapters/access-mode-support.js';
import { throwIfAborted } from '../../adapters/abort-utils.js';
import { CliNameSchema } from '../../config/model-capabilities-types.js';
import { getGlobalRegistry } from '../../adapters/unified-registry.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';
import type { CliName } from '../../cli-adapters/types.js';
import { getFallbackChainForCategory } from '../../cli-adapters/fallback-chains.js';
import { isDisabledSlotUnserved } from '../../cli-adapters/gateway-slot-arm.js';

/** Maps TaskCategory to FallbackTaskType for chain lookup. */
const CATEGORY_TO_FALLBACK_TYPE: Record<TaskCategory, string> = {
  code_generation: 'code',
  code_review: 'code',
  testing: 'code',
  research: 'research',
  exploration: 'research',
  documentation: 'documentation',
  architecture: 'analysis',
  security_review: 'analysis',
  planning: 'analysis',
  devops: 'general',
};

/**
 * Maps expert roles to task categories for CLI specialization (Issue #858).
 */
export const ROLE_TO_TASK_CATEGORY: Record<string, TaskCategory> = {
  code_expert: 'code_generation',
  architecture_expert: 'architecture',
  security_expert: 'security_review',
  documentation_expert: 'documentation',
  testing_expert: 'testing',
  devops_expert: 'devops',
  research_expert: 'research',
  pm_expert: 'planning',
  ux_expert: 'planning',
};

/**
 * Resolves a model preference string to the correct CLI-specific adapter.
 * Delegates to the unified registry for cached, centralized routing.
 * (Issue #827, #1149)
 */
export function resolveAdapterForModelPreference(
  modelPreference: string,
  fallbackAdapter: IModelAdapter | undefined,
  logger: ILogger
): IModelAdapter | undefined {
  const registry = getGlobalRegistry();
  const adapter = registry.getAdapterForModel(modelPreference);
  // If the registry returned its default (model not recognized), use fallback
  if (adapter === registry.getDefault() && fallbackAdapter !== undefined) {
    logger.debug('Model preference not in registry, using fallback adapter', { modelPreference });
    return fallbackAdapter;
  }
  logger.info('Routing expert to CLI for model preference', { modelPreference });
  return adapter;
}

/**
 * Resolves the optimal CLI adapter for an expert role using the
 * task specialization matrix when no explicit model preference is given.
 * Delegates to the unified registry for cached, centralized routing.
 * (Issue #858 Phase 3, #1149)
 */
export function resolveAdapterForRole(
  role: string,
  fallbackAdapter: IModelAdapter | undefined,
  logger: ILogger
): IModelAdapter | undefined {
  const category = ROLE_TO_TASK_CATEGORY[role];
  if (category === undefined) return fallbackAdapter;

  const registry = getGlobalRegistry();
  const adapter = registry.getAdapter(category);
  logger.info('Auto-routing expert to specialized CLI', {
    role,
    category,
    preferredCli: registry.getRouting(category)?.primaryCli,
  });
  return adapter;
}

/**
 * Returns the fallback chain of CLIs for an expert role, excluding
 * a specified CLI (typically the one that just failed). (#1532)
 *
 * Used by execute_expert to retry with a different CLI on rate-limit errors.
 */
export function getExpertFallbackChain(
  role: string,
  excludeCli: string,
  logger: ILogger
): CliName[] {
  const category = ROLE_TO_TASK_CATEGORY[role];
  if (category === undefined) return [];
  const bucketType = CATEGORY_TO_FALLBACK_TYPE[category];
  const chain = getFallbackChainForCategory(
    category,
    bucketType as Parameters<typeof getFallbackChainForCategory>[1]
  );
  // #6590/#6720: a CLI disabled via NEXUS_DISABLED_CLIS is a fallback only when
  // its family's gateway model serves the slot (the variable is transport-scoped).
  const filtered = chain.filter((cli) => cli !== excludeCli && !isDisabledSlotUnserved(cli));
  logger.debug('Expert fallback chain resolved', { role, category, excludeCli, chain: filtered });
  return [...filtered];
}

interface ModeCandidateOptions {
  readonly role: string;
  readonly mode: ExecutionAccessMode;
  readonly logger: ILogger;
  readonly includeRoleChain: boolean;
  readonly signal?: AbortSignal | undefined;
  readonly exclude?: IModelAdapter | undefined;
}
interface ModeCandidateEvidence {
  readonly seen: Set<IModelAdapter>;
  unsupported: number;
  unknown: number;
  unavailable: number;
  excluded: number;
}
function slotName(adapter: IModelAdapter): string | undefined {
  try {
    const provider = adapter.providerId;
    return typeof provider === 'string' && provider !== ''
      ? provider.replace(/^cli-/, '')
      : undefined;
  } catch {
    return undefined;
  }
}
function excludedCandidate(
  adapter: IModelAdapter,
  name: string,
  options: ModeCandidateOptions
): boolean {
  if (adapter === options.exclude) return true;
  const cli = CliNameSchema.safeParse(name);
  if (!cli.success) return false;
  return (
    (options.exclude !== undefined && name === slotName(options.exclude)) ||
    isDisabledSlotUnserved(cli.data)
  );
}
async function eligibleCandidate(
  adapter: IModelAdapter | undefined,
  options: ModeCandidateOptions,
  evidence: ModeCandidateEvidence
): Promise<boolean> {
  throwIfAborted(options.signal, 'Worker eligibility aborted');
  if (adapter === undefined || evidence.seen.has(adapter)) return false;
  evidence.seen.add(adapter);
  const name = slotName(adapter);
  if (name === undefined) {
    evidence.unavailable++;
    return false;
  }
  if (excludedCandidate(adapter, name, options)) {
    evidence.excluded++;
    return false;
  }
  const support = await queryModelAccessMode(adapter, options.mode, options.signal);
  if (support === true) return true;
  if (support === false) evidence.unsupported++;
  else evidence.unknown++;
  return false;
}

/**
 * Deterministic bounded candidates: role primary, supplied fallback, canonical
 * role chain. Every distinct adapter is queried at most once. Unknown never
 * earns eligibility; it remains distinct from measured non-support. This is
 * selection evidence only: execution-time enforcement must remain authoritative.
 */
export async function resolveAdapterForRoleAccess(
  primary: IModelAdapter | undefined,
  fallback: IModelAdapter,
  options: ModeCandidateOptions
): Promise<Result<IModelAdapter, string>> {
  const evidence: ModeCandidateEvidence = {
    seen: new Set(),
    unsupported: 0,
    unknown: 0,
    unavailable: 0,
    excluded: 0,
  };
  for (const adapter of [primary, fallback]) {
    if (await eligibleCandidate(adapter, options, evidence)) return ok(adapter as IModelAdapter);
  }
  const chain = options.includeRoleChain
    ? getExpertFallbackChain(
        options.role,
        primary === undefined ? '' : (slotName(primary) ?? ''),
        options.logger
      )
    : [];
  for (const cli of new Set(chain)) {
    let adapter: IModelAdapter;
    try {
      adapter = getGlobalRegistry().getAdapterForCli(cli);
    } catch {
      evidence.unavailable++;
      continue;
    }
    if (await eligibleCandidate(adapter, options, evidence)) return ok(adapter);
  }
  return err(
    `unsupported worker access-mode delivery: no measured compatible adapter ` +
      `(unsupported=${String(evidence.unsupported)}, unknown=${String(evidence.unknown)}, unavailable=${String(evidence.unavailable)}, excluded=${String(evidence.excluded)})`
  );
}
