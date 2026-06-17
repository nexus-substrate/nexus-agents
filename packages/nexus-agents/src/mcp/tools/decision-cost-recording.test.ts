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

import type { AgentVoteResult } from '../../cli/vote-types.js';
import { DecisionCostStore } from '../../observability/decision-cost-store.js';
import {
  votesToCostInputs,
  recordDecisionCost,
  resolveBillingMode,
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

  it('derives api-mode cost from reported tokens via the shared pricing table', () => {
    // A vote result carrying token counts (forward-compat shape).
    const withTokens = {
      ...vote({ role: 'security', model: 'claude-sonnet' }),
      inputTokens: 1000,
      outputTokens: 200,
    };
    const inputs = votesToCostInputs([withTokens]);
    expect(inputs[0]?.inputTokens).toBe(1000);
    expect(inputs[0]?.outputTokens).toBe(200);
    // computeCostUSD returns a number (0 for unknown-model pricing, >=0 otherwise).
    expect(typeof inputs[0]?.costUsd).toBe('number');
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
});
