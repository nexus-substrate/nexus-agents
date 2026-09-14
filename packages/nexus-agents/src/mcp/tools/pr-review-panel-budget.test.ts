/**
 * Tests for the pr_review panel-read budget (#6003).
 *
 * The panel-read budget is a TOKEN question (the #6003 contrarian seat): what
 * the voters can be sent is bounded by the smallest context window on the
 * panel, not by the hash cap. These tests pin the derivation, the fail-closed
 * fallback, and the two named empty cases.
 *
 * @module mcp/tools/pr-review-panel-budget.test
 */

import { describe, it, expect } from 'vitest';
import { createLogger, type IModelAdapter } from '../../core/index.js';
import { getTokenEstimator, type TokenEstimatorProvider } from '../../core/token-estimator.js';
import { MAX_REVIEWED_DIFF_BYTES } from '../../audit/reviewed-diff-hash.js';
import { CLI_NAMES } from '../../config/model-capabilities-types.js';
import { getDefaultModelForCli } from '../../config/model-config-helpers.js';
import { MAX_DIFF_INPUT_LENGTH, PrReviewInputSchema } from './pr-review-tool.js';
import {
  PANEL_PROMPT_OVERHEAD_TOKENS,
  resolvePanelReadBudget,
  resolvePrReviewPanelBudget,
  type ContextWindowLookup,
} from './pr-review-panel-budget.js';

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

describe('resolvePanelReadBudget (#6003)', () => {
  it('derives the budget from the smallest voter window, minus overhead, at the conservative ratio', () => {
    const budget = resolvePanelReadBudget(
      ['big-model', 'small-model'],
      MAX_REVIEWED_DIFF_BYTES,
      registryOf({ 'big-model': 1_000_000, 'small-model': 200_000 })
    );
    expect(budget.source).toBe('registry');
    // (200,000 − 16,000 overhead tokens) × 3.5 bytes/token = 644,000 bytes.
    // The SMALLER window wins: a budget from the 1M model would overflow the
    // 200k seat, and one overflowed seat is one seat that did not review.
    expect(budget.panelReadBudgetBytes).toBe(644_000);
    expect(budget.bindingCapBytes).toBe(MAX_REVIEWED_DIFF_BYTES);
    expect(budget.detail).toContain('small-model');
    expect(budget.detail).toContain('200,000');
  });

  it('uses the shared estimator ratio, never looser than any provider it knows', () => {
    // Bytes ≥ chars for any UTF-8 string, so budgeting bytes at the SMALLEST
    // chars-per-token ratio can only under-send, never overflow a window.
    const window = PANEL_PROMPT_OVERHEAD_TOKENS + 1_000;
    const budget = resolvePanelReadBudget(
      ['m'],
      MAX_REVIEWED_DIFF_BYTES,
      registryOf({ m: window })
    );
    expect(budget.panelReadBudgetBytes).toBe(Math.floor(1_000 * minCharsPerToken()));
    expect(budget.detail).toContain(`${String(minCharsPerToken())} bytes/token`);
  });

  it('falls back to the binding cap when ANY panel window is unknown (fail closed)', () => {
    const budget = resolvePanelReadBudget(
      ['known', 'unknown'],
      MAX_REVIEWED_DIFF_BYTES,
      registryOf({ known: 1_000_000 })
    );
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.panelReadBudgetBytes).toBe(MAX_REVIEWED_DIFF_BYTES);
    expect(budget.detail).toContain('unknown');
    expect(budget.detail).toContain('context window unknown');
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
      ['tiny'],
      MAX_REVIEWED_DIFF_BYTES,
      registryOf({ tiny: PANEL_PROMPT_OVERHEAD_TOKENS })
    );
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.panelReadBudgetBytes).toBe(MAX_REVIEWED_DIFF_BYTES);
    expect(budget.detail).toContain('overhead');
  });

  it('rejects a non-positive window as unknown rather than deriving a negative budget', () => {
    const budget = resolvePanelReadBudget(
      ['zero'],
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

describe('resolvePrReviewPanelBudget (#6003)', () => {
  const adapter = (modelId: string): IModelAdapter => ({ modelId }) as unknown as IModelAdapter;

  it('reads the gateway panel models when gateway adapters are configured', () => {
    const budget = resolvePrReviewPanelBudget(
      { gatewayAdapters: [adapter('a'), adapter('b')], simulate: false },
      logger,
      registryOf({ a: 300_000, b: 400_000 })
    );
    expect(budget.source).toBe('registry');
    // The smaller gateway window (a: 300k) is the one the derivation names.
    expect(budget.detail).toContain('300,000 tokens (a)');
  });

  it('CLI path: the minimum over EVERY CLI default model, without probing for CLIs', () => {
    // The live panel round-robins across whichever CLIs are installed, each on
    // its registry default model. Taking the minimum over all four defaults is
    // never looser than the real panel's minimum, and costs no subprocess.
    const windows: Record<string, number> = {};
    for (const cli of CLI_NAMES) windows[getDefaultModelForCli(cli)] = 1_000_000;
    const smallestCli = CLI_NAMES[3];
    windows[getDefaultModelForCli(smallestCli)] = 200_000;
    const budget = resolvePrReviewPanelBudget(
      { gatewayAdapters: undefined, simulate: false },
      logger,
      registryOf(windows)
    );
    expect(budget.source).toBe('registry');
    expect(budget.detail).toContain(`200,000 tokens (${getDefaultModelForCli(smallestCli)})`);
  });

  it('CLI path against the REAL registry: every CLI default has a window, so the panel reads whole diffs up to the input cap', () => {
    // Pins the production derivation, not a stub: if a CLI default model ever
    // loses its registry window, this drops to the fallback and the panel
    // silently reads less. All four defaults are ~1M-token models today.
    const budget = resolvePrReviewPanelBudget(
      { gatewayAdapters: undefined, simulate: false },
      logger
    );
    expect(budget.source).toBe('registry');
    expect(budget.panelReadBudgetBytes).toBeGreaterThan(MAX_DIFF_INPUT_LENGTH);
  });

  it('a gateway model the registry does not know falls back, and says which one', () => {
    const budget = resolvePrReviewPanelBudget(
      {
        gatewayAdapters: [adapter('claude-opus'), adapter('mystery-gateway-model')],
        simulate: false,
      },
      logger
    );
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.detail).toContain('mystery-gateway-model');
  });

  it('a simulated panel states why its budget is the cap', () => {
    const budget = resolvePrReviewPanelBudget(
      { gatewayAdapters: undefined, simulate: true },
      logger,
      registryOf({})
    );
    expect(budget.source).toBe('binding-cap-fallback');
    expect(budget.detail).toContain('simulated panel');
  });
});
