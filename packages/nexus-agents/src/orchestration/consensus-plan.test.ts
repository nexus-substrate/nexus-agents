/**
 * Tests for consensus planning — multi-CLI plan generation and synthesis.
 * (Source: Issue #863)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../core/index.js';
import type { ICliAdapter, CliName, CliResponse, CliError } from '../cli-adapters/types.js';
import { executeConsensusPlan } from './consensus-plan.js';
import { createDefaultPlanConfig } from './consensus-plan-types.js';
import { resetOutcomeStore, getOutcomeStore } from './outcomes/index.js';

// Force in-memory outcome store (avoid hydrating from disk in tests)
vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

// ============================================================================
// Mock Adapter Factory
// ============================================================================

function createPlanAdapter(name: CliName, response: string, delay = 10): ICliAdapter {
  return {
    name,

    async execute(): Promise<{ ok: true; value: CliResponse } | { ok: false; error: CliError }> {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return ok({ text: response, model: `${name}-model` });
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async healthCheck() {
      return {
        healthy: true,
        version: '1.0.0',
        versionStatus: 'supported' as const,
        checkedAt: new Date(),
      };
    },
    getModelInfo() {
      return { id: name, name, contextWindow: 200_000, maxOutput: 8192 };
    },
  } as unknown as ICliAdapter;
}

function createFailingPlanAdapter(name: CliName): ICliAdapter {
  return {
    name,
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(): Promise<{ ok: true; value: CliResponse } | { ok: false; error: CliError }> {
      return err({
        code: 'EXECUTION_ERROR',
        message: `${name} failed`,
        cli: name,
        retryable: false,
      });
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async healthCheck() {
      return {
        healthy: false,
        version: 'unknown',
        versionStatus: 'unsupported' as const,
        checkedAt: new Date(),
      };
    },
    getModelInfo() {
      return { id: name, name, contextWindow: 200_000, maxOutput: 8192 };
    },
  } as unknown as ICliAdapter;
}

function buildAdapters(...entries: Array<[CliName, ICliAdapter]>): Map<CliName, ICliAdapter> {
  return new Map(entries);
}

/** Create a JSON plan response. */
function jsonPlan(plan: Record<string, unknown>): string {
  return JSON.stringify(plan);
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  resetOutcomeStore();
  vi.restoreAllMocks();
});

describe('createDefaultPlanConfig', () => {
  it('returns expected defaults', () => {
    const config = createDefaultPlanConfig();
    expect(config.maxClis).toBe(3);
    expect(config.perCliTimeoutMs).toBe(300_000);
    expect(config.maxOutputCharsPerCli).toBe(8000);
  });
});

describe('executeConsensusPlan', () => {
  const claudePlan = jsonPlan({
    steps: [
      { description: 'Define the API interface and data models', complexity: 'medium' },
      { description: 'Implement authentication middleware', complexity: 'high' },
      { description: 'Write integration tests', complexity: 'medium' },
    ],
    risks: [
      {
        description: 'Auth complexity may delay timeline',
        impact: 'high',
        mitigation: 'Use existing OAuth library',
      },
    ],
    alternatives: ['Use API Gateway instead of custom auth'],
    summary: 'Three-phase approach focusing on API-first design',
  });

  const codexPlan = jsonPlan({
    steps: [
      { description: 'Set up project scaffolding and dependencies', complexity: 'low' },
      { description: 'Define API interface and data models', complexity: 'medium' },
      { description: 'Implement core business logic', complexity: 'high' },
      { description: 'Write unit and integration tests', complexity: 'medium' },
    ],
    risks: [
      {
        description: 'Dependency version conflicts',
        impact: 'medium',
        mitigation: 'Pin versions in lockfile',
      },
    ],
    alternatives: ['Use monorepo structure'],
    summary: 'Four-phase iterative development with TDD',
  });

  it('says so when every CLI answered but none produced a parseable plan (#4585)', async () => {
    // Both CLIs succeed, so `clisUsed` is non-empty, but neither output parses,
    // so `successPlans` is empty. The summary used to render as an ordinary
    // consensus plan that happened to have zero steps — a clean sheet over zero
    // evidence — rather than saying nothing was comparable.
    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', 'I would start by thinking about it.')],
      ['codex', createPlanAdapter('codex', 'Here are some thoughts, no structure.')]
    );

    const result = await executeConsensusPlan('Plan something', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toContain('No parseable plan');
    expect(result.value.summary).not.toMatch(/\*\*0 steps\*\*/);
  });

  it('dispatches plan to multiple CLIs', async () => {
    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', claudePlan)],
      ['codex', createPlanAdapter('codex', codexPlan)]
    );

    const result = await executeConsensusPlan('Design a REST API for user management', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toContain('claude');
    expect(result.value.clisUsed).toContain('codex');
    expect(result.value.partitions).toHaveLength(2);
  });

  it('identifies agreed steps between CLIs', async () => {
    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', claudePlan)],
      ['codex', createPlanAdapter('codex', codexPlan)]
    );

    const result = await executeConsensusPlan('Design a REST API', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Both CLIs propose "Define the API interface and data models"
    const multiAgreed = result.value.agreedSteps.filter((s) => s.proposedBy.length > 1);
    expect(multiAgreed.length).toBeGreaterThan(0);
  });

  it('detects divergences in plan granularity', async () => {
    // Claude has 3 steps, Codex has 4 — not enough divergence (4 < 3*1.5=4.5)
    // Create a plan with 6 steps vs 3 to trigger
    const detailedPlan = jsonPlan({
      steps: [
        { description: 'Step 1', complexity: 'low' },
        { description: 'Step 2', complexity: 'low' },
        { description: 'Step 3', complexity: 'low' },
        { description: 'Step 4', complexity: 'low' },
        { description: 'Step 5', complexity: 'low' },
        { description: 'Step 6', complexity: 'low' },
      ],
      risks: [],
      alternatives: [],
      summary: 'Detailed plan',
    });

    const briefPlan = jsonPlan({
      steps: [
        { description: 'Step A', complexity: 'high' },
        { description: 'Step B', complexity: 'high' },
        { description: 'Step C', complexity: 'high' },
      ],
      risks: [{ description: 'Risk 1', impact: 'high', mitigation: 'Fix it' }],
      alternatives: [],
      summary: 'Brief plan',
    });

    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', detailedPlan)],
      ['codex', createPlanAdapter('codex', briefPlan)]
    );

    const result = await executeConsensusPlan('Design a system', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 6 steps vs 3 steps → 6 > 3*1.5=4.5 → divergence on granularity
    const granularity = result.value.divergences.find((d) => d.topic === 'Plan granularity');
    expect(granularity).toBeDefined();

    // Risk assessment divergence: one has risks, other doesn't
    const riskDiv = result.value.divergences.find((d) => d.topic === 'Risk assessment');
    expect(riskDiv).toBeDefined();
  });

  it('collects and deduplicates risks', async () => {
    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', claudePlan)],
      ['codex', createPlanAdapter('codex', codexPlan)]
    );

    const result = await executeConsensusPlan('Design a system', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Two unique risks from two CLIs
    expect(result.value.risks.length).toBe(2);
  });

  it('collects alternatives from all CLIs', async () => {
    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', claudePlan)],
      ['codex', createPlanAdapter('codex', codexPlan)]
    );

    const result = await executeConsensusPlan('Design a system', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.alternatives).toContain('Use API Gateway instead of custom auth');
    expect(result.value.alternatives).toContain('Use monorepo structure');
  });

  it('returns error when no adapters available', async () => {
    const result = await executeConsensusPlan('Plan something', buildAdapters());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('No CLI adapters available');
  });

  it('handles partial failures gracefully', async () => {
    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', claudePlan)],
      ['codex', createFailingPlanAdapter('codex')]
    );

    const result = await executeConsensusPlan('Plan the migration', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual(['claude']);
    expect(result.value.agreedSteps.length).toBe(3);
  });

  it('handles all CLIs failing', async () => {
    const adapters = buildAdapters(
      ['claude', createFailingPlanAdapter('claude')],
      ['codex', createFailingPlanAdapter('codex')]
    );

    const result = await executeConsensusPlan('Plan something', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual([]);
    expect(result.value.summary).toContain('All planning CLIs failed');
  });

  it('handles unparseable responses', async () => {
    const adapters = buildAdapters(['claude', createPlanAdapter('claude', 'Not valid JSON')]);

    const result = await executeConsensusPlan('Plan something', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // A CLI whose plan did not parse produced no plan (#5697): not "used",
    // and its partition records the failure instead of a planning success.
    expect(result.value.clisUsed).toEqual([]);
    expect(result.value.agreedSteps.length).toBe(0);
    const partition = result.value.partitions.find((p) => p.cli === 'claude');
    expect(partition?.success).toBe(false);
    expect(partition?.error).toContain('unparseable');
  });

  it('records task outcomes', async () => {
    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', claudePlan)],
      ['codex', createPlanAdapter('codex', codexPlan)]
    );

    await executeConsensusPlan('Plan a feature', adapters);

    const outcomes = getOutcomeStore().query({});
    expect(outcomes.length).toBe(2);
    expect(outcomes.map((o) => o.cli).sort()).toEqual(['claude', 'codex']);
    expect(outcomes.every((o) => o.category === 'planning')).toBe(true);
  });

  it('prefers CLIs in order: claude, codex, gemini', async () => {
    const adapters = buildAdapters(
      ['gemini', createPlanAdapter('gemini', claudePlan)],
      ['codex', createPlanAdapter('codex', codexPlan)],
      ['claude', createPlanAdapter('claude', claudePlan)]
    );

    const result = await executeConsensusPlan('Plan the system', adapters, {
      config: { maxClis: 2 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const clis = result.value.partitions.map((p) => p.cli);
    expect(clis[0]).toBe('claude');
    expect(clis[1]).toBe('codex');
  });

  it('works with single CLI', async () => {
    const adapters = buildAdapters(['claude', createPlanAdapter('claude', claudePlan)]);

    const result = await executeConsensusPlan('Plan the migration', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual(['claude']);
    expect(result.value.agreedSteps.length).toBe(3);
    expect(result.value.divergences.length).toBe(0);
  });

  it('handles JSON with non-array steps field', async () => {
    const badPlan = jsonPlan({
      steps: 'not an array',
      risks: 42,
      alternatives: true,
      summary: 'Bad plan',
    });
    const adapters = buildAdapters(['claude', createPlanAdapter('claude', badPlan)]);

    const result = await executeConsensusPlan('Plan something', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Non-array fields should be treated as empty
    expect(result.value.agreedSteps.length).toBe(0);
    expect(result.value.risks.length).toBe(0);
  });

  it('handles malformed JSON that matches regex but fails parse', async () => {
    const malformed = 'Here is my plan: {"steps": [{"invalid}';
    const adapters = buildAdapters(['claude', createPlanAdapter('claude', malformed)]);

    const result = await executeConsensusPlan('Plan something', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Plan parse fails → no agreed steps
    expect(result.value.agreedSteps.length).toBe(0);
  });

  it('handles JSON null as plan response', async () => {
    const adapters = buildAdapters(['claude', createPlanAdapter('claude', 'null')]);

    const result = await executeConsensusPlan('Plan something', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.agreedSteps.length).toBe(0);
  });

  it('filters invalid steps that fail schema validation', async () => {
    const planWithBadSteps = jsonPlan({
      steps: [
        { description: 'Valid step', complexity: 'medium' },
        { noDescription: true }, // missing description field
        { description: '', complexity: 'low' }, // empty description
      ],
      risks: [],
      alternatives: [],
      summary: 'Mixed plan',
    });
    const adapters = buildAdapters(['claude', createPlanAdapter('claude', planWithBadSteps)]);

    const result = await executeConsensusPlan('Plan something', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should have parsed some valid steps (at least the first one)
    expect(result.value.agreedSteps.length).toBeGreaterThanOrEqual(1);
  });

  it('records failure outcomes with failureCategory', async () => {
    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', claudePlan)],
      ['codex', createFailingPlanAdapter('codex')]
    );

    await executeConsensusPlan('Plan a feature', adapters);

    const outcomes = getOutcomeStore().query({});
    const failedOutcome = outcomes.find((o) => !o.success);
    expect(failedOutcome).toBeDefined();
    expect(failedOutcome?.cli).toBe('codex');
  });

  it('records real model ids for failed partitions instead of unknown (#4194)', async () => {
    const adapters = buildAdapters(
      ['claude', createPlanAdapter('claude', claudePlan)],
      ['codex', createFailingPlanAdapter('codex')]
    );

    await executeConsensusPlan('Plan a feature', adapters);

    const outcomes = getOutcomeStore().query({});
    const failedOutcome = outcomes.find((o) => !o.success);
    // Failed partitions fall back to the adapter's configured model id
    // (mock getModelInfo().id === adapter name), never 'unknown'.
    expect(failedOutcome?.model).toBe('codex');
    const successOutcome = outcomes.find((o) => o.success);
    expect(successOutcome?.model).toBe('claude-model');
  });

  it('falls back to the adapter configured model when the response omits model (#4194)', async () => {
    const adapter = createPlanAdapter('claude', claudePlan);
    (adapter as { execute: unknown }).execute = () => Promise.resolve(ok({ text: claudePlan }));
    const adapters = buildAdapters(['claude', adapter]);

    const result = await executeConsensusPlan('Plan a feature', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.partitions[0]?.model).toBe('claude');
    expect(getOutcomeStore().query({})[0]?.model).toBe('claude');
  });
});
