/**
 * Tests for the decision-cost recording bridge (#3855).
 *
 * Covers the vote-result → VoterCostInput mapping (model captured, missing
 * usage left unmeasured) and the end-to-end record path against an injected
 * store.
 *
 * @module mcp/tools/decision-cost-recording.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ILogger } from '../../core/index.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import { DecisionCostStore } from '../../observability/decision-cost-store.js';
import {
  votesToCostInputs,
  recordDecisionCost,
  resolveBillingMode,
  getDroppedCostRecordCount,
  getDroppedCostWarnCount,
  resetDroppedCostRecordCount,
  _setWarnClockForTests,
} from './decision-cost-recording.js';

function vote(over: Partial<AgentVoteResult>): AgentVoteResult {
  return {
    role: 'architect',
    vote: { decision: 'approve', reasoning: 'ok', confidence: 0.8 },
    processingTimeMs: 100,
    source: 'llm',
    cli: 'anthropic',
    model: 'claude-sonnet',
    ...over,
  };
}

describe('votesToCostInputs', () => {
  it('captures the model and leaves usage unmeasured when the adapter reported none', () => {
    const inputs = votesToCostInputs([vote({ role: 'architect', model: 'claude-sonnet' })]);
    expect(inputs[0]?.role).toBe('architect');
    expect(inputs[0]?.model).toBe('claude-sonnet');
    expect(inputs[0]?.inputTokens).toBeUndefined();
    expect(inputs[0]?.outputTokens).toBeUndefined();
    expect(inputs[0]?.costUsd).toBeUndefined();
  });

  it('derives api-mode cost from adapter-reported tokens via the shared pricing table', () => {
    // #3910: AgentVoteResult now carries the adapter's per-call token counts.
    const withTokens = vote({
      role: 'security',
      model: 'claude-sonnet',
      inputTokens: 1000,
      outputTokens: 200,
    });
    const inputs = votesToCostInputs([withTokens]);
    expect(inputs[0]?.inputTokens).toBe(1000);
    expect(inputs[0]?.outputTokens).toBe(200);
    // claude-sonnet is priced in the registry, so a real cost is attached
    // (#4165: costUsd is only ever present when pricing actually resolved).
    expect(inputs[0]?.costUsd).toBeGreaterThan(0);
  });

  it('OMITS costUsd for an unpriced model but keeps the tokens (#4165 — unmeasured, not $0)', () => {
    // A model with no pricing anywhere in the registry chain must not record
    // a measured $0 — the cost field is left off so the rollup counts the
    // voter as UNMEASURED (#3855 semantics).
    const inputs = votesToCostInputs([
      vote({ role: 'devex', model: 'mystery-model-xyz', inputTokens: 500, outputTokens: 100 }),
    ]);
    expect(inputs[0]?.inputTokens).toBe(500);
    expect(inputs[0]?.outputTokens).toBe(100);
    expect(inputs[0]?.costUsd).toBeUndefined();
    expect(Object.keys(inputs[0] ?? {})).not.toContain('costUsd');
  });

  it('states the price basis alongside the cost (#4406 — list, not contract-accurate)', () => {
    const inputs = votesToCostInputs([
      vote({ role: 'security', model: 'claude-sonnet', inputTokens: 1000, outputTokens: 200 }),
    ]);
    expect(inputs[0]?.costUsd).toBeGreaterThan(0);
    expect(inputs[0]?.priceBasis).toBe('list');
  });

  it("states 'unknown' when the model resolved with no pricing anywhere in the chain", () => {
    const inputs = votesToCostInputs([
      vote({ role: 'devex', model: 'mystery-model-xyz', inputTokens: 500, outputTokens: 100 }),
    ]);
    expect(inputs[0]?.costUsd).toBeUndefined();
    expect(inputs[0]?.priceBasis).toBe('unknown');
  });

  it('OMITS the basis when no price was ever looked up (no usage reported)', () => {
    // We never consulted the registry for this voter, so we have nothing to
    // say about its price basis — absent, not 'unknown'.
    const inputs = votesToCostInputs([vote({ role: 'architect', model: 'claude-sonnet' })]);
    expect(Object.keys(inputs[0] ?? {})).not.toContain('priceBasis');
  });
});

describe('resolveBillingMode', () => {
  const original = process.env['NEXUS_BILLING_MODE'];
  afterEach(() => {
    if (original === undefined) delete process.env['NEXUS_BILLING_MODE'];
    else process.env['NEXUS_BILLING_MODE'] = original;
  });

  it('defaults to plan', () => {
    delete process.env['NEXUS_BILLING_MODE'];
    expect(resolveBillingMode()).toBe('plan');
  });

  it('honors api', () => {
    process.env['NEXUS_BILLING_MODE'] = 'api';
    expect(resolveBillingMode()).toBe('api');
  });
});

describe('recordDecisionCost', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'decision-cost-rec-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rolls up + persists and returns the summary for the response', () => {
    const store = new DecisionCostStore({ filePath: join(dir, 'dc.jsonl'), dataDir: dir });
    const summary = recordDecisionCost({
      decisionId: 'd1',
      gate: 'consensus_vote',
      votes: [vote({ role: 'architect' }), vote({ role: 'security' })],
      store,
      billingMode: 'api',
    });

    expect(summary.voterCount).toBe(2);
    // No tokens reported ⇒ both unmeasured (honest floor, not measured $0).
    expect(summary.unmeasuredVoters).toBe(2);
    expect(summary.totalCostUsd).toBe(0);
    expect(store.size).toBe(1);
  });

  it('a voter with adapter-provided tokens yields a MEASURED rollup (#3910)', () => {
    const store = new DecisionCostStore({ filePath: join(dir, 'dc.jsonl'), dataDir: dir });
    const summary = recordDecisionCost({
      decisionId: 'd-measured',
      gate: 'consensus_vote',
      // Tokens now ride on AgentVoteResult straight from the adapter usage layer.
      votes: [
        vote({ role: 'architect', model: 'claude-sonnet', inputTokens: 1200, outputTokens: 300 }),
        vote({ role: 'security', model: 'claude-sonnet', inputTokens: 800, outputTokens: 150 }),
      ],
      store,
      billingMode: 'api',
    });

    // Resolves from unmeasured → MEASURED: both voters reported usage.
    expect(summary.measuredVoters).toBe(2);
    expect(summary.unmeasuredVoters).toBe(0);
    expect(summary.totalInputTokens).toBe(2000);
    expect(summary.totalOutputTokens).toBe(450);
    expect(summary.totalTokens).toBe(2450);
  });

  it('rolls up a token-reporting voter on an UNPRICED model as unmeasured end-to-end (#4165)', () => {
    const store = new DecisionCostStore({ filePath: join(dir, 'dc.jsonl'), dataDir: dir });
    const summary = recordDecisionCost({
      decisionId: 'd-unpriced',
      gate: 'consensus_vote',
      votes: [
        vote({ role: 'devex', model: 'mystery-model-xyz', inputTokens: 500, outputTokens: 100 }),
        vote({ role: 'architect', model: 'claude-sonnet', inputTokens: 1000, outputTokens: 200 }),
      ],
      store,
      billingMode: 'api',
    });

    // The unpriced voter's tokens are kept, but its unknown cost surfaces as
    // UNMEASURED (total is a floor) — never a measured $0 (#3855).
    expect(summary.measuredVoters).toBe(1);
    expect(summary.unmeasuredVoters).toBe(1);
    expect(summary.totalTokens).toBe(1800);
    const unpriced = summary.perVoter.find((v) => v.role === 'devex');
    expect(unpriced?.unmeasured).toBe(true);
    expect(unpriced?.totalTokens).toBe(600);
    expect(unpriced?.costUsd).toBe(0);
    // Total cost reflects ONLY the priced voter.
    const priced = summary.perVoter.find((v) => v.role === 'architect');
    expect(summary.totalCostUsd).toBe(priced?.costUsd);
    expect(summary.totalCostUsd).toBeGreaterThan(0);
  });
});

describe('non-silent cost drops (#3910)', () => {
  beforeEach(() => {
    resetDroppedCostRecordCount();
  });

  /** A store whose persistence always reports a drop (fs/schema failure). */
  function failingStore(): DecisionCostStore {
    const store = new DecisionCostStore({ filePath: join(tmpdir(), 'unused.jsonl') });
    // Simulate the JsonlStore reporting a failed persist without throwing.
    (store as unknown as { record: (i: unknown) => unknown }).record = (input) => ({
      record: {
        decisionId: (input as { decisionId: string }).decisionId,
        gate: (input as { gate: string }).gate,
        timestamp: '2026-06-17T00:00:00.000Z',
        summary: {
          billingMode: 'api',
          voterCount: 1,
          measuredVoters: 1,
          unmeasuredVoters: 0,
          totalInputTokens: 100,
          totalOutputTokens: 50,
          totalTokens: 150,
          totalCostUsd: 0.001,
          perVoter: [],
          perModel: [],
        },
      },
      persisted: false,
    });
    return store;
  }

  it('logs AND counts a dropped rollup instead of silently swallowing it', () => {
    const warnings: { message: string; context?: unknown }[] = [];
    const logger: ILogger = {
      debug: () => {},
      info: () => {},
      warn: (message, context) => {
        warnings.push({ message, context });
      },
      error: () => {},
      child: () => logger,
      setLevel: () => {},
    };

    expect(getDroppedCostRecordCount()).toBe(0);

    // Never throws into the caller — the decision still gets its summary.
    const summary = recordDecisionCost({
      decisionId: 'd-dropped',
      gate: 'consensus_vote',
      votes: [vote({ role: 'architect', model: 'claude-sonnet' })],
      store: failingStore(),
      billingMode: 'api',
      logger,
    });

    expect(summary.totalCostUsd).toBe(0.001);
    // Visible, not silent: counter incremented + warning logged.
    expect(getDroppedCostRecordCount()).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('dropped');
  });

  it('rate-limits the warn under sustained drops while counting every drop (#3916)', () => {
    // An unwritable store must not flood the log per-decision. Drive many
    // consecutive drops and assert the warn count is BOUNDED (first-N burst,
    // then suppressed) while the drop counter still reflects EVERY drop and the
    // decision never fails.
    let warnCount = 0;
    const logger: ILogger = {
      debug: () => {},
      info: () => {},
      warn: () => {
        warnCount += 1;
      },
      error: () => {},
      child: () => logger,
      setLevel: () => {},
    };
    const store = failingStore();

    const drops = 200;
    for (let i = 0; i < drops; i++) {
      const summary = recordDecisionCost({
        decisionId: `d-${String(i)}`,
        gate: 'consensus_vote',
        votes: [vote({ role: 'architect', model: 'claude-sonnet' })],
        store,
        billingMode: 'api',
        logger,
      });
      // Never-fail invariant holds on every iteration.
      expect(summary.totalCostUsd).toBe(0.001);
    }

    // Counter is exact: every drop counted.
    expect(getDroppedCostRecordCount()).toBe(drops);
    // Warns are bounded, NOT one-per-drop (first-5 burst, then periodic).
    expect(warnCount).toBe(getDroppedCostWarnCount());
    expect(warnCount).toBeGreaterThanOrEqual(1);
    expect(warnCount).toBeLessThanOrEqual(6);
    expect(warnCount).toBeLessThan(drops);
  });

  it('still warns on a SLOW leak after the silence window despite count suppression (#3916)', () => {
    // Pure count-based suppression would hide a 1/hr leak for ~999 drops. The
    // time escape surfaces it once the silence window elapses.
    let warnCount = 0;
    const logger: ILogger = {
      debug: () => {},
      info: () => {},
      warn: () => {
        warnCount += 1;
      },
      error: () => {},
      child: () => logger,
      setLevel: () => {},
    };
    const store = failingStore();
    const drop = (id: string): void => {
      recordDecisionCost({
        decisionId: id,
        gate: 'consensus_vote',
        votes: [vote({ role: 'architect', model: 'claude-sonnet' })],
        store,
        billingMode: 'api',
        logger,
      });
    };

    _setWarnClockForTests(1_000_000);
    for (let i = 0; i < 5; i++) drop(`burst-${String(i)}`); // first-5 burst → 5 warns
    expect(warnCount).toBe(5);
    drop('same-time-1'); // post-burst, no time elapsed, not 1000th → suppressed
    drop('same-time-2');
    expect(warnCount).toBe(5);
    _setWarnClockForTests(1_000_000 + 60_000); // advance past the silence window
    drop('after-window'); // time escape → warns even though count would suppress
    expect(warnCount).toBe(6);
    expect(getDroppedCostRecordCount()).toBe(8); // every drop still counted
    _setWarnClockForTests(null);
  });
});
