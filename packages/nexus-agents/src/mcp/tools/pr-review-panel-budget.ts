/**
 * nexus-agents/mcp — pr_review panel-read budget (#6003).
 *
 * How many bytes of a PR diff the voter PANEL is sent is a TOKEN question, not
 * a byte question (the #6003 contrarian seat, adopted by the panel): the bound
 * is the smallest context window across the models the panel runs on. The
 * hash binding is a different question — `MAX_REVIEWED_DIFF_BYTES`, measured in
 * UTF-8 bytes — and `pr-review-diff-budget.ts` keeps the two apart.
 *
 * Derivation, per {@link resolvePanelReadBudget}:
 *
 *   panelReadBudgetBytes = floor((minContextWindow − PANEL_PROMPT_OVERHEAD_TOKENS)
 *                                × conservativeBytesPerToken)
 *
 * FAIL CLOSED: if any panel model's window is unknown to the registry, or the
 * panel resolves to zero models, or the smallest window leaves no room past the
 * overhead, the budget is the binding cap — exactly the pre-#6003 behaviour —
 * and the reason is recorded in `detail` so the ledger never claims a registry
 * derivation it did not use.
 *
 * @module mcp/tools/pr-review-panel-budget
 */

import type { ILogger, IModelAdapter } from '../../core/index.js';
import { MAX_REVIEWED_DIFF_BYTES } from '../../audit/reviewed-diff-hash.js';
import { getTokenEstimator, type TokenEstimatorProvider } from '../../core/token-estimator.js';
import { getDefaultRegistry } from '../../config/model-registry.js';
import { getDefaultModelForCli } from '../../config/model-config-helpers.js';
import { CLI_NAMES } from '../../config/model-capabilities-types.js';
import {
  packDiffForPanelAndBinding,
  type PanelReviewPacking,
  type ReviewBudgets,
} from './pr-review-diff-budget.js';
import { buildPrReviewProposal } from './pr-review-proposal.js';
import type { PrReviewInput } from './pr-review-tool.js';

/**
 * Tokens reserved for everything in the panel prompt that is NOT the diff, plus
 * the reply. Cited, not computed (importing the schema caps here would form a
 * cycle with pr-review-tool.ts); `pr-review-panel-budget.test.ts` pins it
 * against them:
 *
 *  - caller fields at their `PrReviewInputSchema` caps: title 500 + description
 *    10,000 + repoContext 2,000 chars → ~3,600 tokens at 3.5 chars/token;
 *  - the voter system prompt + vote scaffold (`cli/voter-prompts.ts`,
 *    `buildVotePrompt`): ~2,000 chars → ~600 tokens;
 *  - the reply: `maxTokens: 4000` in `cli/voter-execution.ts`.
 *
 * ≈ 8,200 tokens; doubled for headroom, because the estimator is an average
 * and an overflowed seat is a seat that did not review.
 */
export const PANEL_PROMPT_OVERHEAD_TOKENS = 16_000;

/** The registry surface this module reads — `ModelRegistry.getEntry` satisfies it. */
export interface ContextWindowLookup {
  getEntry(modelId: string): { readonly contextWindow?: number | undefined };
}

/**
 * The most conservative chars-per-token ratio the shared estimator knows,
 * reused as bytes-per-token. One UTF-8 byte is at most one char, so a budget
 * spent in bytes at the smallest ratio can only UNDER-send relative to the
 * token bound — never overflow it. No second estimator is defined here.
 */
function conservativeBytesPerToken(): number {
  const providers: readonly TokenEstimatorProvider[] = ['claude', 'openai', 'gemini', 'generic'];
  const estimator = getTokenEstimator();
  return Math.min(...providers.map((p) => estimator.getCharsPerToken(p)));
}

/** The binding cap as the panel budget — the pre-#6003 behaviour — with its reason. */
function bindingCapFallback(bindingCapBytes: number, reason: string): ReviewBudgets {
  return {
    bindingCapBytes,
    panelReadBudgetBytes: bindingCapBytes,
    source: 'binding-cap-fallback',
    detail: `binding-cap fallback: ${reason}`,
  };
}

/** The smallest known window on the panel, or the model whose window is unknown. */
function smallestWindow(
  panelModelIds: readonly string[],
  registry: ContextWindowLookup
): { readonly modelId: string; readonly contextWindow: number } | { readonly unknown: string } {
  let smallest: { modelId: string; contextWindow: number } | undefined;
  for (const modelId of panelModelIds) {
    const window = registry.getEntry(modelId).contextWindow;
    if (window === undefined || !Number.isFinite(window) || window <= 0)
      return { unknown: modelId };
    if (smallest === undefined || window < smallest.contextWindow) {
      smallest = { modelId, contextWindow: window };
    }
  }
  // The caller has already refused an empty panel; this is the type's proof.
  return smallest ?? { unknown: '(none)' };
}

/**
 * Derive the panel-read budget from the panel's model ids (see the module doc
 * for the formula and the fail-closed rules). Pure given `registry`; the default
 * is the process-wide model registry.
 */
export function resolvePanelReadBudget(
  panelModelIds: readonly string[],
  bindingCapBytes: number,
  registry: ContextWindowLookup = getDefaultRegistry()
): ReviewBudgets {
  if (panelModelIds.length === 0) {
    return bindingCapFallback(bindingCapBytes, 'zero resolvable panel models');
  }
  const window = smallestWindow(panelModelIds, registry);
  if ('unknown' in window) {
    return bindingCapFallback(bindingCapBytes, `context window unknown for "${window.unknown}"`);
  }
  const roomTokens = window.contextWindow - PANEL_PROMPT_OVERHEAD_TOKENS;
  if (roomTokens <= 0) {
    return bindingCapFallback(
      bindingCapBytes,
      `smallest context window ${window.contextWindow.toLocaleString('en-US')} tokens ` +
        `(${window.modelId}) leaves no room past the ${PANEL_PROMPT_OVERHEAD_TOKENS.toLocaleString('en-US')}-token prompt overhead`
    );
  }
  const bytesPerToken = conservativeBytesPerToken();
  const panelReadBudgetBytes = Math.floor(roomTokens * bytesPerToken);
  return {
    bindingCapBytes,
    panelReadBudgetBytes,
    source: 'registry',
    detail:
      `min context window ${window.contextWindow.toLocaleString('en-US')} tokens (${window.modelId}) ` +
      `− ${PANEL_PROMPT_OVERHEAD_TOKENS.toLocaleString('en-US')} overhead tokens × ${String(bytesPerToken)} bytes/token ` +
      `(core/token-estimator, smallest provider ratio) = ${panelReadBudgetBytes.toLocaleString('en-US')} bytes`,
  };
}

/** How the pr_review panel will be run — what decides which models it reads on. */
export interface PanelShape {
  /** In-process gateway adapters (#4040), or `undefined` for the CLI path. */
  readonly gatewayAdapters: readonly IModelAdapter[] | undefined;
  /** A simulated panel (tests / demos) has no live model, so no window to read. */
  readonly simulate: boolean;
}

/**
 * Which models the pr_review panel can run on, BEFORE the vote runs.
 *
 *  - Gateway path (#4040): the configured gateway adapters — every role is
 *    assigned from this set (round-robin or `NEXUS_VOTER_MODEL_<ROLE>`), so its
 *    minimum is the panel's minimum.
 *  - CLI path: the registry default model of EVERY CLI, not only the detected
 *    ones. The live panel round-robins across a subset of these arms, and each
 *    arm runs its CLI's default model (`getAdapterForCli`) — so the minimum over
 *    the superset is never looser than the real panel's, and no subprocess is
 *    probed to find out which subset it was (`collectRealVotes` probes once
 *    already; a second round per review would double that cost).
 */
function panelModelIds(gatewayAdapters: readonly IModelAdapter[] | undefined): readonly string[] {
  if (gatewayAdapters !== undefined && gatewayAdapters.length > 0) {
    return gatewayAdapters.map((a) => a.modelId);
  }
  return CLI_NAMES.map((cli) => getDefaultModelForCli(cli));
}

/**
 * The pr_review panel-read budget for this process's voter panel: resolve the
 * panel's model ids, then {@link resolvePanelReadBudget} them against the
 * binding cap — `MAX_REVIEWED_DIFF_BYTES`, the hash cap, unchanged by #6003.
 * A simulated panel has no live model, so its budget is the cap and says so.
 */
export function resolvePrReviewPanelBudget(
  panel: PanelShape,
  logger: ILogger,
  registry: ContextWindowLookup = getDefaultRegistry()
): ReviewBudgets {
  const bindingCapBytes = MAX_REVIEWED_DIFF_BYTES;
  if (panel.simulate) {
    return bindingCapFallback(bindingCapBytes, 'simulated panel has no live model');
  }
  const modelIds = panelModelIds(panel.gatewayAdapters);
  const budget = resolvePanelReadBudget(modelIds, bindingCapBytes, registry);
  if (budget.source === 'binding-cap-fallback') {
    logger.warn('pr_review panel budget fell back to the binding cap (#6003)', {
      detail: budget.detail,
      panelModels: modelIds,
    });
  }
  return budget;
}

/**
 * #4140 large-diff affordance, with the panel read and the hash binding decided
 * separately (#6003). The panel budget comes from the voters' context windows
 * ({@link resolvePrReviewPanelBudget}); the binding cap is the hash cap. Within
 * both → byte-identical proposal (no pack, no note, `coverage: undefined`). Over
 * the panel budget → security-first packed subset with a prepended
 * partial-review NOTE (warned). Over only the binding cap → the panel reads the
 * whole diff and the coverage object says the hash binds a prefix (logged, not
 * warned: the record discloses it, and nothing was withheld from the voters).
 */
export function preparePanelProposal(
  input: PrReviewInput,
  panel: PanelShape,
  removedBefore: { comments: number; fields: number; tags: number },
  logger: ILogger
): { proposal: string; coverage: PanelReviewPacking['coverage'] } {
  const budgets = resolvePrReviewPanelBudget(panel, logger);
  const { coverage, packedDiff, note } = packDiffForPanelAndBinding(input.prDiff, budgets);
  const body = coverage === undefined ? input : { ...input, prDiff: packedDiff };
  if (coverage?.partial === true) {
    logger.warn(
      `pr_review diff over the panel budget (${String(budgets.panelReadBudgetBytes)} bytes, ${budgets.source}) — reviewed ${String(coverage.reviewedFiles)} of ${String(coverage.totalFiles)} files, dropped ${String(coverage.droppedFiles.length)}`
    );
  } else if (coverage?.binding === 'prefix') {
    logger.info('pr_review panel read the whole diff; the audit hash binds a prefix (#6003)', {
      totalBytes: coverage.totalBytes,
      boundBytes: coverage.boundBytes,
      budgetSource: coverage.budgetSource,
    });
  }
  return { proposal: note + buildPrReviewProposal(body, removedBefore), coverage };
}
