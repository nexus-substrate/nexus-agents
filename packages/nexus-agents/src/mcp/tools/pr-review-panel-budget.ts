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
 * The models are the panel's OWN seats: {@link resolvePanelSeats} runs the same
 * seat → adapter assignment `collectRealVotes` uses (`assignPanelSeats`), and
 * the tool hands those seats back to the vote, so the budget describes exactly
 * the adapters that review. A seat whose adapter has not yet detected its model
 * (`pending-detection` — the CLI path before first use), or whose model the
 * registry has no window for (a custom OpenAI-compatible gateway, an OpenCode
 * arm on its own default), is UNKNOWN.
 *
 * FAIL CLOSED: an unknown seat, a panel that cannot be resolved, a smallest
 * window with no room past the overhead, or a simulated panel makes the budget
 * the binding cap — exactly the pre-#6003 behaviour — with the reason, naming
 * the seat, recorded in `detail` so the ledger never claims a registry
 * derivation it did not use.
 *
 * @module mcp/tools/pr-review-panel-budget
 */

import type { ILogger, IModelAdapter } from '../../core/index.js';
import { MAX_REVIEWED_DIFF_BYTES } from '../../audit/reviewed-diff-hash.js';
import { getTokenEstimator, type TokenEstimatorProvider } from '../../core/token-estimator.js';
import { getDefaultRegistry } from '../../config/model-registry.js';
import { UNRESOLVED_MODEL_ID } from '../../config/model-equivalence.js';
import type { VoterRole } from '../../cli/vote-types.js';
import { assignPanelSeats } from '../../cli/voter-agents.js';
import { resolveAdapter } from '../../cli/voter-adapter-resolve.js';
import {
  packDiffForPanelAndBinding,
  type PanelReviewPacking,
  type ReviewBudgets,
} from './pr-review-diff-budget.js';
import { buildPrReviewProposal } from './pr-review-proposal.js';
import type { ReviewSanitizationInput } from './pr-review-record-producer.js';
import { removalsBefore, resolveBindingMeasurement } from './pr-review-sanitization-view.js';
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

/** One panel seat and the model its adapter reports. */
export interface PanelSeatModel {
  readonly seat: string;
  readonly modelId: string;
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
    detail: `fallback: ${reason}`,
  };
}

/** `1000000` → `1,000,000`: the detail is read by people. */
function num(n: number): string {
  return n.toLocaleString('en-US');
}

/** The seat's window, or the reason it is unknown — naming the seat either way. */
function seatWindow(
  seat: PanelSeatModel,
  registry: ContextWindowLookup
): { readonly contextWindow: number } | { readonly unknown: string } {
  if (seat.modelId === UNRESOLVED_MODEL_ID) {
    return { unknown: `seat ${seat.seat}: model not yet detected (${UNRESOLVED_MODEL_ID})` };
  }
  const window = registry.getEntry(seat.modelId).contextWindow;
  if (window === undefined || !Number.isFinite(window) || window <= 0) {
    return { unknown: `seat ${seat.seat}: context window unknown for "${seat.modelId}"` };
  }
  return { contextWindow: window };
}

/** The smallest known window on the panel, or the first seat whose window is unknown. */
function smallestWindow(
  seats: readonly PanelSeatModel[],
  registry: ContextWindowLookup
):
  { readonly seat: PanelSeatModel; readonly contextWindow: number } | { readonly unknown: string } {
  let smallest: { seat: PanelSeatModel; contextWindow: number } | undefined;
  for (const seat of seats) {
    const window = seatWindow(seat, registry);
    if ('unknown' in window) return window;
    if (smallest === undefined || window.contextWindow < smallest.contextWindow) {
      smallest = { seat, contextWindow: window.contextWindow };
    }
  }
  // The caller has already refused an empty panel; this is the type's proof.
  return smallest ?? { unknown: 'zero resolvable panel models' };
}

/**
 * Derive the panel-read budget from the panel's seats (see the module doc for
 * the formula and the fail-closed rules). Pure given `registry`; the default
 * is the process-wide model registry.
 */
export function resolvePanelReadBudget(
  seats: readonly PanelSeatModel[],
  bindingCapBytes: number,
  registry: ContextWindowLookup = getDefaultRegistry()
): ReviewBudgets {
  if (seats.length === 0) {
    return bindingCapFallback(bindingCapBytes, 'zero resolvable panel models');
  }
  const window = smallestWindow(seats, registry);
  if ('unknown' in window) return bindingCapFallback(bindingCapBytes, window.unknown);
  const roomTokens = window.contextWindow - PANEL_PROMPT_OVERHEAD_TOKENS;
  if (roomTokens <= 0) {
    return bindingCapFallback(
      bindingCapBytes,
      `smallest window ${num(window.contextWindow)} tok (${window.seat.modelId}) ≤ ` +
        `${num(PANEL_PROMPT_OVERHEAD_TOKENS)} tok prompt overhead`
    );
  }
  const bytesPerToken = conservativeBytesPerToken();
  const panelReadBudgetBytes = Math.floor(roomTokens * bytesPerToken);
  // Short on purpose: it is stamped into a record summary the store caps at
  // 500 chars, beside a dropped-file list that must survive (#6003 review).
  return {
    bindingCapBytes,
    panelReadBudgetBytes,
    source: 'registry',
    detail:
      `min window ${num(window.contextWindow)} tok (${window.seat.modelId}) − ` +
      `${num(PANEL_PROMPT_OVERHEAD_TOKENS)} × ${String(bytesPerToken)} B/tok = ${num(panelReadBudgetBytes)} B`,
  };
}

/** The panel's resolved seats, or why they could not be resolved. */
export type PanelSeats =
  | { readonly ok: true; readonly seats: ReadonlyMap<VoterRole, IModelAdapter> }
  | { readonly ok: false; readonly reason: string };

/**
 * Resolve the pr_review panel's seats with the SAME assignment the vote uses
 * (`assignPanelSeats`, #6003), so the budget reads the adapters that will
 * actually review. The tool hands the result back to `collectRealVotes` as
 * `roleAdapters`; a failure here is a fallback reason, not an exception — the
 * vote still runs, resolving its own seats, on the pre-#6003 budget.
 */
export async function resolvePanelSeats(
  roles: readonly VoterRole[],
  gatewayAdapters: readonly IModelAdapter[] | undefined,
  logger: ILogger
): Promise<PanelSeats> {
  const fallback = resolveAdapter({ gatewayAdapters });
  if ('error' in fallback) return { ok: false, reason: `no adapter: ${fallback.error}` };
  try {
    const seats = await assignPanelSeats(fallback.adapter, { roles, gatewayAdapters }, logger);
    return { ok: true, seats };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `seat assignment failed: ${message}` };
  }
}

/** How the pr_review panel will be run — what decides which models it reads on. */
export interface PanelShape {
  /** The panel's own seats (see {@link resolvePanelSeats}); `undefined` when simulated. */
  readonly seats: PanelSeats | undefined;
  /** A simulated panel (tests / demos) has no live model, so no window to read. */
  readonly simulate: boolean;
}

/** The seat → model pairs the budget reads, in role order. */
function seatModels(seats: ReadonlyMap<VoterRole, IModelAdapter>): readonly PanelSeatModel[] {
  return [...seats].map(([role, adapter]) => ({ seat: role, modelId: adapter.modelId }));
}

/**
 * The pr_review panel-read budget for the panel that is about to run: the
 * resolved seats' models against the binding cap — `MAX_REVIEWED_DIFF_BYTES`,
 * the hash cap, unchanged by #6003.
 */
export function resolvePrReviewPanelBudget(
  panel: PanelShape,
  logger: ILogger,
  registry: ContextWindowLookup = getDefaultRegistry()
): ReviewBudgets {
  const bindingCapBytes = MAX_REVIEWED_DIFF_BYTES;
  if (panel.simulate || panel.seats === undefined) {
    return bindingCapFallback(bindingCapBytes, 'simulated panel has no live model');
  }
  if (!panel.seats.ok) return bindingCapFallback(bindingCapBytes, panel.seats.reason);
  const models = seatModels(panel.seats.seats);
  const budget = resolvePanelReadBudget(models, bindingCapBytes, registry);
  if (budget.source === 'binding-cap-fallback') {
    logger.warn('pr_review panel budget fell back to the binding cap (#6003)', {
      detail: budget.detail,
      panelModels: models,
    });
  }
  return budget;
}

/**
 * #4140 large-diff affordance, with the panel read and the hash binding decided
 * separately (#6003). The panel budget comes from the seats' context windows
 * ({@link resolvePrReviewPanelBudget}); the binding cap is the hash cap. Within
 * both → byte-identical proposal (no pack, no note, `coverage: undefined`). Over
 * the panel budget → security-first packed subset with a prepended
 * partial-review NOTE (warned). Over only the binding cap → the panel reads the
 * whole diff and the coverage object says the hash binds a prefix (logged, not
 * warned: the record discloses it, and nothing was withheld from the voters).
 *
 * The binding side is measured over the bytes the HASH covers, resolved from
 * `sanitization` (#6177): on the MCP path that is the middleware's raw
 * measurement, not `input.prDiff`, which is the sanitized text the panel reads.
 */
export function preparePanelProposal(
  input: PrReviewInput,
  panel: PanelShape,
  sanitization: ReviewSanitizationInput | undefined,
  logger: ILogger,
  registry: ContextWindowLookup = getDefaultRegistry()
): { proposal: string; coverage: PanelReviewPacking['coverage'] } {
  const budgets = resolvePrReviewPanelBudget(panel, logger, registry);
  const binding = resolveBindingMeasurement(input.prDiff, sanitization);
  const { coverage, packedDiff, note } = packDiffForPanelAndBinding(input.prDiff, budgets, binding);
  const removedBefore = removalsBefore(sanitization);
  const body = coverage === undefined ? input : { ...input, prDiff: packedDiff };
  if (coverage?.partial === true) {
    logger.warn(
      `pr_review diff over the panel budget (${String(budgets.panelReadBudgetBytes)} bytes, ${budgets.source}) — reviewed ${String(coverage.reviewedFiles)} of ${String(coverage.totalFiles)} files, dropped ${String(coverage.droppedFiles.length)}`
    );
  } else if (coverage?.binding === 'prefix') {
    logger.info('pr_review panel read the whole diff; the audit hash binds a prefix (#6003)', {
      totalBytes: coverage.totalBytes,
      boundBytes: coverage.boundBytes,
      bindingSource: coverage.bindingSource,
      bindingTotalBytes: binding.totalBytes,
      budgetSource: coverage.budgetSource,
    });
  }
  return { proposal: note + buildPrReviewProposal(body, removedBefore), coverage };
}

/**
 * The tool's entry (#6003): resolve the panel's seats ONCE, budget the proposal
 * against them, and return the seats so the caller hands them to the vote —
 * the panel then runs on exactly the adapters whose windows set its budget. A
 * simulated panel resolves nothing (no live model to read).
 */
export async function preparePanelForReview(
  input: PrReviewInput,
  roles: readonly VoterRole[],
  opts: {
    readonly gatewayAdapters?: readonly IModelAdapter[] | undefined;
    /** The middleware's pre-sanitization view (#5385); `undefined` = no sanitizer. */
    readonly sanitization?: ReviewSanitizationInput | undefined;
  },
  logger: ILogger
): Promise<{
  proposal: string;
  coverage: PanelReviewPacking['coverage'];
  seats: PanelSeats | undefined;
}> {
  const seats = input.simulate
    ? undefined
    : await resolvePanelSeats(roles, opts.gatewayAdapters, logger);
  const panel = { seats, simulate: input.simulate };
  const packed = preparePanelProposal(input, panel, opts.sanitization, logger);
  return { ...packed, seats };
}
