/**
 * Tests for the pr_review panel-read budget (#6003).
 *
 * The panel-read budget is a TOKEN question (the #6003 contrarian seat): what
 * the voters can be sent is bounded by the smallest context window on the
 * panel, not by the hash cap. These tests pin the derivation, the fail-closed
 * fallback over the panel's OWN seats, and the named empty cases.
 *
 * @module mcp/tools/pr-review-panel-budget.test
 */

import { describe, it, expect, vi } from 'vitest';
import { createLogger, type IModelAdapter } from '../../core/index.js';
import { getTokenEstimator, type TokenEstimatorProvider } from '../../core/token-estimator.js';
import { MAX_REVIEWED_DIFF_BYTES } from '../../audit/reviewed-diff-hash.js';
import { UNRESOLVED_MODEL_ID } from '../../config/model-equivalence.js';
import { PR_REVIEW_ROLES, PrReviewInputSchema } from './pr-review-tool.js';
import {
  PANEL_PROMPT_OVERHEAD_TOKENS,
  preparePanelProposal,
  resolvePanelReadBudget,
  resolvePanelSeats,
  resolvePrReviewPanelBudget,
  type ContextWindowLookup,
  type PanelSeatModel,
  type PanelSeats,
} from './pr-review-panel-budget.js';

// #6003: the CLI path of `assignPanelSeats` probes for installed CLIs; under
// the spawn guard none is, so answer "none" — the single-CLI host the review
// named as the failing input.
vi.mock('../../cli-adapters/factory.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli-adapters/factory.js')>()),
  getAvailableClis: () => Promise.resolve([]),
}));

const logger = createLogger({ component: 'test', level: 'silent' });

/** A registry stub keyed on model id; a missing id resolves to NO window. */
function registryOf(windows: Record<string, number | undefined>): ContextWindowLookup {
  return {
    getEntry: (modelId: string) => ({ contextWindow: windows[modelId] }),
  };
}

/** The most conservative chars-per-token ratio the shared estimator knows. */
function minCharsPerToken(): number {
  const providers: readonly TokenEstimatorProvider[] = ['claude', 'openai', 'gemini', 'generic'];
  return Math.min(...providers.map((p) => getTokenEstimator().getCharsPerToken(p)));
}

/** Seats named after their model, for the derivation tests. */
function seatsOf(...modelIds: string[]): PanelSeatModel[] {
  return modelIds.map((modelId, i) => ({ seat: `seat${String(i)}`, modelId }));
}

const adapter = (modelId: string): IModelAdapter => ({ modelId }) as unknown as IModelAdapter;

/** A resolved panel of `PR_REVIEW_ROLES` where every seat is `a`. */
function uniformSeats(a: IModelAdapter): PanelSeats {
  return { ok: true, seats: new Map(PR_REVIEW_ROLES.map((role) => [role, a] as const)) };
}

describe('resolvePanelReadBudget (#6003)', () => {
  it('derives the budget from the smallest voter window, minus overhead, at the conservative ratio', () => {
    const budget = resolvePanelReadBudget(
      seatsOf('big-model', 'small-model'),
      MAX_REVIEWED_DIFF_BYTES,
      registryOf({ 'big-model': 1_000_000, 'small-model': 200_000 })
    );
    expect(budget.source).toBe('registry');
    // (200,000 − 16,000 overhead tokens) × 3.5 bytes/token = 644,000 bytes.
    // The SMALLER window wins: a budget from the 1M model would overflow the
    // 200k seat, and one overflowed seat is one seat that did not review.
    expect(budget.panelReadBudgetBytes).toBe(644_000);
    expect(budget.bindingCapBytes).toBe(MAX_REVIEWED_DIFF_BYTES);
    expect(budget.detail).toBe(
      'min window 200,000 tok (small-model) − 16,000 × 3.5 B/tok = 644,000 B'
    );
  });

  it('uses the shared estimator ratio, never looser than any provider it knows', () => {
    // Bytes ≥ chars for any UTF-8 string, so budgeting bytes at the SMALLEST
    // chars-per-token ratio can only under-send, never overflow a window.
    const window = PANEL_PROMPT_OVERHEAD_TOKENS + 1_000;
    const budget = resolvePanelReadBudget(
      seatsOf('m'),
      MAX_REVIEWED_DIFF_BYTES,
      registryOf({ m: window })
    );
    expect(budget.panelReadBudgetBytes).toBe(Math.floor(1_000 * minCharsPerToken()));
    expect(budget.detail).toContain(`${String(minCharsPerToken())} B/tok`);
  });

  it('falls back to the binding cap when ANY seat window is unknown, naming the seat', () => {
    const budget = resolvePanelReadBudget(
      [
        { seat: 'architect', modelId: 'known' },
        { seat: 'catfish', modelId: 'unknown-model' },
      ],
      MAX_REVIEWED_DIFF_BYTES,
      registryOf({ known: 1_000_000 })
    );
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.panelReadBudgetBytes).toBe(MAX_REVIEWED_DIFF_BYTES);
    expect(budget.detail).toBe(
      'fallback: seat catfish: context window unknown for "unknown-model"'
    );
  });

  it('a seat whose adapter has not detected its model yet is unknown (the CLI path before first use)', () => {
    const budget = resolvePanelReadBudget(
      [{ seat: 'security', modelId: UNRESOLVED_MODEL_ID }],
      MAX_REVIEWED_DIFF_BYTES,
      // Even a registry that claimed a window for the placeholder must not be read.
      registryOf({ [UNRESOLVED_MODEL_ID]: 1_000_000 })
    );
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.detail).toContain('seat security: model not yet detected');
  });

  it('names the empty case: a panel with zero resolvable models falls back', () => {
    const budget = resolvePanelReadBudget([], MAX_REVIEWED_DIFF_BYTES, registryOf({}));
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.panelReadBudgetBytes).toBe(MAX_REVIEWED_DIFF_BYTES);
    expect(budget.detail).toContain('zero resolvable panel models');
  });

  it('falls back when the smallest window leaves no room past the prompt overhead', () => {
    // A window at or under the overhead would derive a budget of ≤0 bytes —
    // a panel that reads nothing. The pre-#6003 behaviour (binding cap) is the
    // safe default, and the reason is recorded so the record does not claim a
    // registry-derived budget it never used.
    const budget = resolvePanelReadBudget(
      seatsOf('tiny'),
      MAX_REVIEWED_DIFF_BYTES,
      registryOf({ tiny: PANEL_PROMPT_OVERHEAD_TOKENS })
    );
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.panelReadBudgetBytes).toBe(MAX_REVIEWED_DIFF_BYTES);
    expect(budget.detail).toContain('prompt overhead');
  });

  it('rejects a non-positive window as unknown rather than deriving a negative budget', () => {
    const budget = resolvePanelReadBudget(
      seatsOf('zero'),
      MAX_REVIEWED_DIFF_BYTES,
      registryOf({ zero: 0 })
    );
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.panelReadBudgetBytes).toBe(MAX_REVIEWED_DIFF_BYTES);
  });

  it('the overhead margin covers every caller-supplied field at its schema cap plus the reply', () => {
    // The margin is a cited constant, not a computed one (importing the schema
    // caps into the budget module would create a cycle). This pins it against
    // drift by reading the caps off the REAL schema: if one grows past what the
    // margin covers, the panel prompt can overflow a window the budget said it fit.
    const shape = PrReviewInputSchema.shape;
    const cap = (n: number | null): number => {
      if (n === null) throw new Error('schema field has no max length');
      return n;
    };
    const callerChars =
      cap(shape.prTitle.maxLength) +
      cap(shape.prDescription.unwrap().maxLength) +
      cap(shape.repoContext.unwrap().maxLength);
    const callerTokens = Math.ceil(callerChars / minCharsPerToken());
    const voterReplyTokens = 4_000; // `maxTokens` in cli/voter-execution.ts
    expect(PANEL_PROMPT_OVERHEAD_TOKENS).toBeGreaterThan(callerTokens + voterReplyTokens);
  });
});

describe('resolvePanelSeats — the budget reads the seats the vote will run on (#6003)', () => {
  it('gateway path: every role is assigned from the gateway adapters', async () => {
    const seats = await resolvePanelSeats(PR_REVIEW_ROLES, [adapter('a'), adapter('b')], logger);
    expect(seats.ok).toBe(true);
    if (!seats.ok) return;
    expect([...seats.seats.keys()]).toEqual([...PR_REVIEW_ROLES]);
    const models = new Set([...seats.seats.values()].map((s) => s.modelId));
    expect(models).toEqual(new Set(['a', 'b']));
  });

  it('single-CLI host: every seat is the registry default adapter, still pending detection', async () => {
    // The review’s failing input. With ≤1 CLI installed `collectRealVotes`
    // puts every role on `getGlobalRegistry().getDefault()` — a lazy
    // ResilientAdapter whose model is `pending-detection` until first use.
    // Reading the four CLI defaults from the registry, as the first cut did,
    // never saw this seat.
    const seats = await resolvePanelSeats(PR_REVIEW_ROLES, undefined, logger);
    expect(seats.ok).toBe(true);
    if (!seats.ok) return;
    expect(seats.seats.size).toBe(PR_REVIEW_ROLES.length);
    for (const seat of seats.seats.values()) expect(seat.modelId).toBe(UNRESOLVED_MODEL_ID);
  });
});

describe('resolvePrReviewPanelBudget (#6003)', () => {
  it('reads the gateway seats when gateway adapters are configured', async () => {
    const seats = await resolvePanelSeats(PR_REVIEW_ROLES, [adapter('a'), adapter('b')], logger);
    const budget = resolvePrReviewPanelBudget(
      { seats, simulate: false },
      logger,
      registryOf({ a: 300_000, b: 400_000 })
    );
    expect(budget.source).toBe('registry');
    // The smaller gateway window (a: 300k) is the one the derivation names.
    expect(budget.detail).toContain('300,000 tok (a)');
  });

  it('single-CLI host with a custom gateway the registry does not know: binding-cap fallback', async () => {
    // The review’s failing input end to end: one CLI, a 32k custom
    // OpenAI-compatible gateway behind `NEXUS_CUSTOM_MODEL`, a 300 KB diff.
    // Before this fix the record said the panel read it whole at a 1M window.
    const seats = await resolvePanelSeats(PR_REVIEW_ROLES, undefined, logger);
    const budget = resolvePrReviewPanelBudget({ seats, simulate: false }, logger);
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.panelReadBudgetBytes).toBe(MAX_REVIEWED_DIFF_BYTES);
    expect(budget.detail).toContain('model not yet detected');
    // ...and once such a seat HAS detected, a model the registry has no window
    // for (the custom gateway) is still unknown, still named.
    const detected = uniformSeats(adapter('my-corp-gateway-32k'));
    const after = resolvePrReviewPanelBudget({ seats: detected, simulate: false }, logger);
    expect(after.source).toBe('binding-cap-fallback');
    expect(after.detail).toContain(
      'seat architect: context window unknown for "my-corp-gateway-32k"'
    );
  });

  it('a panel that could not be resolved falls back with that reason', () => {
    const seats: PanelSeats = { ok: false, reason: 'no adapter: none configured' };
    const budget = resolvePrReviewPanelBudget({ seats, simulate: false }, logger, registryOf({}));
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.detail).toBe('fallback: no adapter: none configured');
  });

  it('a simulated panel states why its budget is the cap', () => {
    const budget = resolvePrReviewPanelBudget(
      { seats: undefined, simulate: true },
      logger,
      registryOf({})
    );
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.detail).toContain('simulated panel');
  });
});

describe('preparePanelProposal — the panel is handed the PACKED subset (#6003)', () => {
  function fileDiff(path: string, marker: string, lines: number): string {
    const body = Array.from({ length: lines }, () => `+${marker}`).join('\n');
    return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -0,0 +1,${String(lines)} @@\n${body}\n`;
  }

  it('a dropped file’s hunk is absent from the proposal and a kept one is present', () => {
    // A 17,000-token window leaves 1,000 tokens × 3.5 = 3,500 bytes for the
    // diff. Two ~3 KB files: the security-first packer keeps one, drops one.
    const registry = registryOf({ small: PANEL_PROMPT_OVERHEAD_TOKENS + 1_000 });
    const seats = uniformSeats(adapter('small'));
    const kept = fileDiff('src/auth-handler.ts', 'KEPT_AUTH_LINE', 120);
    const dropped = fileDiff('src/readme-helper.ts', 'DROPPED_HELPER_LINE', 120);
    const input = PrReviewInputSchema.parse({ prTitle: 'two files', prDiff: dropped + kept });
    const { proposal, coverage } = preparePanelProposal(
      input,
      { seats, simulate: false },
      undefined,
      logger,
      registry
    );
    expect(coverage?.panelRead).toBe('partial');
    expect(coverage?.droppedFiles).toEqual(['src/readme-helper.ts']);
    expect(proposal).toContain('KEPT_AUTH_LINE');
    expect(proposal).not.toContain('DROPPED_HELPER_LINE');
    expect(proposal).toContain('partial review');
  });

  it('within both budgets the proposal carries the whole diff and no coverage', () => {
    const registry = registryOf({ big: 1_000_000 });
    const input = PrReviewInputSchema.parse({
      prTitle: 'small',
      prDiff: fileDiff('src/a.ts', 'ONLY_LINE', 3),
    });
    const { proposal, coverage } = preparePanelProposal(
      input,
      { seats: uniformSeats(adapter('big')), simulate: false },
      undefined,
      logger,
      registry
    );
    expect(coverage).toBeUndefined();
    expect(proposal).toContain('ONLY_LINE');
  });
});
