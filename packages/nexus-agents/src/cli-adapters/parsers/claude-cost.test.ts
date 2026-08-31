/**
 * The Claude CLI reports a measured cost, and it was dropped (#5241).
 *
 * `ClaudeCliResponse` has declared `total_cost_usd` and `modelUsage[*].costUSD`
 * since the shape was written, and the parser reads that JSON. Neither ever
 * reached `CliResponse`, so `CliResponse.costUsd` had **no producer at all**.
 *
 * Two consumers were dead as a result:
 *
 * - `cli/orchestrate-command.ts:264` — `if (cliResponse.costUsd !== undefined)`
 *   guards a `Cost: $…` line that therefore never printed.
 * - `cli-adapters/budget-router.ts:378` —
 *   `const actualCostUsd = result.value.costUsd ?? estimatedCostUsd;`
 *   could never take its left branch, so a variable named `actual` always held
 *   an estimate, and nothing recorded which it was. That is the vacuous-fallback
 *   shape #5119 deleted elsewhere.
 *
 * `extractCostUsd` is OPTIONAL on the parser interface on purpose. Only Claude
 * reports a cost; codex, gemini, opencode and agy do not. An absent method says
 * "this vendor does not report cost", which is a different fact from a present
 * method returning `null` ("it reports cost, and this response carried none").
 * Inferring the first from a missing number is what #5241 asks us not to do.
 *
 * @module cli-adapters/parsers/claude-cost.test
 */

import { describe, it, expect } from 'vitest';

import { ClaudeResponseParser } from './claude-parser.js';
import { SubprocessCliAdapter } from '../subprocess-adapter.js';
import type { CliTask, ICliResponseParser } from '../types-capability.js';

const parser = new ClaudeResponseParser();

/** A real `claude --output-format json` result envelope, trimmed. */
const REAL_RESULT = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 4210,
  result: 'done',
  session_id: 'sess-abc',
  total_cost_usd: 0.0342,
  usage: { input_tokens: 1200, output_tokens: 340 },
});

describe('ClaudeResponseParser.extractCostUsd (#5241)', () => {
  it('extracts the vendor-reported total_cost_usd', () => {
    expect(parser.extractCostUsd(REAL_RESULT)).toBe(0.0342);
  });

  it('returns null when the response carries no cost', () => {
    // Distinct from the method being absent. The parser reports cost; this
    // particular response did not carry one.
    const noCost = JSON.stringify({ type: 'result', is_error: false, result: 'done' });
    expect(parser.extractCostUsd(noCost)).toBeNull();
  });

  it('falls back to summing modelUsage costUSD when total_cost_usd is absent', () => {
    // The CLI emits per-model costs on some versions and only the total on
    // others; both are declared on the response shape.
    const perModel = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'done',
      modelUsage: {
        'claude-opus': { inputTokens: 10, outputTokens: 5, costUSD: 0.02 },
        'claude-haiku': { inputTokens: 8, outputTokens: 2, costUSD: 0.005 },
      },
    });
    expect(parser.extractCostUsd(perModel)).toBeCloseTo(0.025, 6);
  });

  it('prefers total_cost_usd over the per-model sum when both are present', () => {
    // The total is the vendor's own figure; summing parts could double-count or
    // miss a component the breakdown omits.
    const both = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'done',
      total_cost_usd: 0.09,
      modelUsage: { 'claude-opus': { inputTokens: 1, outputTokens: 1, costUSD: 0.02 } },
    });
    expect(parser.extractCostUsd(both)).toBe(0.09);
  });

  it('returns null, not 0, when modelUsage is present but carries no costUSD', () => {
    // The distinction that matters to a budget: "the vendor reported nothing"
    // is not "the vendor reported free". Summing to 0 and returning it would
    // tell budget-router the call cost nothing.
    //
    // Added because mutation testing found this unpinned: dropping the
    // `sawCost` guard (`return sawCost ? sum : null` -> `return sum`) left all
    // other tests green, since every no-cost fixture omitted `modelUsage`
    // entirely and returned early on the null check above.
    const costless = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'done',
      modelUsage: { 'claude-opus': { inputTokens: 10, outputTokens: 5 } },
    });
    expect(parser.extractCostUsd(costless)).toBeNull();
  });

  it('returns null rather than throwing on malformed output', () => {
    expect(parser.extractCostUsd('not json at all')).toBeNull();
  });

  it('rejects a negative or non-finite cost', () => {
    // A cost is a measurement; a negative or NaN one is corrupt input, and
    // letting it through would debit the budget router with garbage.
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const raw = JSON.stringify({
        type: 'result',
        is_error: false,
        result: 'd',
        total_cost_usd: bad,
      });
      expect(parser.extractCostUsd(raw)).toBeNull();
    }
  });
});

// ============================================================================
// The seam — real parser into the real adapter, neither stubbed
// ============================================================================

/**
 * Both halves were individually reachable and the WIRE between them was what
 * did not exist: the parser could always have read `total_cost_usd`, and
 * `CliResponse.costUsd` was always declared. Testing either alone leaves the
 * defect intact, so this drives the real `ClaudeResponseParser` through the
 * real `SubprocessCliAdapter` response path.
 */
class SeamAdapter extends SubprocessCliAdapter {
  override readonly name = 'claude' as const;
  readonly version = '1.0.0';
  protected override readonly transientRetry = { enabled: false };
  protected readonly parser: ICliResponseParser = new ClaudeResponseParser();

  protected getCommand(_task: CliTask): { command: string; args: string[] } {
    return { command: 'echo', args: [] };
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getModelInfo() {
    return {
      id: 'claude-test',
      name: 'Claude Test',
      contextWindow: 100000,
      maxOutput: 10000,
      costPerMillionInput: 1,
      costPerMillionOutput: 2,
    };
  }

  /** Drive the real stdout→CliResponse path without spawning a subprocess. */
  buildFrom(stdout: string): ReturnType<SeamAdapter['handleSubprocessOutput']> {
    return this.handleSubprocessOutput(stdout, '', 0);
  }
}

describe('the parser→CliResponse seam carries the cost (#5241)', () => {
  const adapter = new SeamAdapter();

  it('puts the vendor-reported cost on CliResponse.costUsd', () => {
    // `CliResponse.costUsd` had NO producer before this. Deleting the
    // `extractCostUsd` call from subprocess-adapter fails this test, and
    // nothing else did.
    const result = adapter.buildFrom(REAL_RESULT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.costUsd).toBe(0.0342);
  });

  it('omits costUsd when the response carried no cost', () => {
    // The pair. A seam that always stamped a cost would satisfy the test above
    // while making `costUsd` meaningless — and `budget-router` would then debit
    // a fabricated figure under the name `actual`.
    const noCost = JSON.stringify({ type: 'result', is_error: false, result: 'done' });
    const result = adapter.buildFrom(noCost);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.costUsd).toBeUndefined();
  });
});
