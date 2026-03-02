/**
 * Tests for parallel exploration — multi-CLI dispatch and synthesis.
 * (Source: Issue #862)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../core/index.js';
import type { ICliAdapter, CliName, CliResponse, CliError } from '../cli-adapters/types.js';
import { executeParallelExploration } from './parallel-exploration.js';
import { isParallelEligible, createDefaultConfig } from './parallel-exploration-types.js';
import { resetOutcomeStore, getOutcomeStore } from './outcomes/index.js';

// Disable persistence so getOutcomeStore() returns a fresh in-memory store
vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

// ============================================================================
// Mock Adapter Factory
// ============================================================================

function createMockAdapter(name: CliName, response: string, delay = 10): ICliAdapter {
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

function createFailingAdapter(name: CliName): ICliAdapter {
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

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  resetOutcomeStore();
  vi.restoreAllMocks();
});

describe('isParallelEligible', () => {
  it('returns true for exploration', () => {
    expect(isParallelEligible('exploration')).toBe(true);
  });

  it('returns true for research', () => {
    expect(isParallelEligible('research')).toBe(true);
  });

  it('returns true for code_review', () => {
    expect(isParallelEligible('code_review')).toBe(true);
  });

  it('returns false for code_generation', () => {
    expect(isParallelEligible('code_generation')).toBe(false);
  });

  it('returns false for planning', () => {
    expect(isParallelEligible('planning')).toBe(false);
  });
});

describe('createDefaultConfig', () => {
  it('returns expected defaults', () => {
    const config = createDefaultConfig();
    expect(config.maxParallelClis).toBe(3);
    expect(config.perCliTimeoutMs).toBe(60_000);
    expect(config.maxOutputCharsPerCli).toBe(4000);
  });
});

describe('executeParallelExploration', () => {
  it('dispatches to multiple CLIs and synthesizes', async () => {
    const adapters = buildAdapters(
      ['gemini', createMockAdapter('gemini', 'Gemini findings')],
      ['claude', createMockAdapter('claude', 'Claude findings')]
    );

    const result = await executeParallelExploration(
      'Explore the codebase and navigate the directory layout',
      adapters
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toContain('gemini');
    expect(result.value.clisUsed).toContain('claude');
    expect(result.value.partitions).toHaveLength(2);
    expect(result.value.synthesized).toContain('gemini perspective');
    expect(result.value.synthesized).toContain('claude perspective');
    expect(result.value.totalDurationMs).toBeGreaterThan(0);
  });

  it('works with a single CLI', async () => {
    const adapters = buildAdapters(['claude', createMockAdapter('claude', 'Solo analysis')]);

    const result = await executeParallelExploration('Explore the codebase structure', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual(['claude']);
    expect(result.value.partitions).toHaveLength(1);
    expect(result.value.synthesized).toContain('Solo analysis');
  });

  it('returns error when no adapters available', async () => {
    const adapters = buildAdapters();

    const result = await executeParallelExploration('Explore something', adapters);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('No CLI adapters available');
  });

  it('handles partial failures gracefully', async () => {
    const adapters = buildAdapters(
      ['gemini', createMockAdapter('gemini', 'Gemini works')],
      ['claude', createFailingAdapter('claude')]
    );

    const result = await executeParallelExploration('Research consensus algorithms', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual(['gemini']);
    expect(result.value.partitions).toHaveLength(2);

    const geminiPartition = result.value.partitions.find((p) => p.cli === 'gemini');
    const claudePartition = result.value.partitions.find((p) => p.cli === 'claude');
    expect(geminiPartition?.success).toBe(true);
    expect(claudePartition?.success).toBe(false);
  });

  it('handles all CLIs failing', async () => {
    const adapters = buildAdapters(
      ['gemini', createFailingAdapter('gemini')],
      ['claude', createFailingAdapter('claude')]
    );

    const result = await executeParallelExploration('Explore patterns in the codebase', adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual([]);
    expect(result.value.synthesized).toContain('All CLI partitions failed');
  });

  it('respects maxParallelClis config', async () => {
    const adapters = buildAdapters(
      ['gemini', createMockAdapter('gemini', 'G')],
      ['claude', createMockAdapter('claude', 'C')],
      ['codex', createMockAdapter('codex', 'X')]
    );

    const result = await executeParallelExploration('Explore the module structure', adapters, {
      config: { maxParallelClis: 2 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.partitions).toHaveLength(2);
  });

  it('truncates long outputs', async () => {
    const longOutput = 'x'.repeat(5000);
    const adapters = buildAdapters(['claude', createMockAdapter('claude', longOutput)]);

    const result = await executeParallelExploration('Explore the codebase', adapters, {
      config: { maxOutputCharsPerCli: 100 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const partition = result.value.partitions[0]!;
    expect(partition.output.length).toBeLessThanOrEqual(100);
    expect(partition.output.endsWith('...')).toBe(true);
  });

  it('records task outcomes', async () => {
    const adapters = buildAdapters(
      ['gemini', createMockAdapter('gemini', 'G findings')],
      ['claude', createMockAdapter('claude', 'C findings')]
    );

    await executeParallelExploration('Explore the codebase and scan directories', adapters);

    const outcomes = getOutcomeStore().query({});
    expect(outcomes.length).toBe(2);
    expect(outcomes.map((o) => o.cli).sort()).toEqual(['claude', 'gemini']);
  });

  it('includes model info in partition results', async () => {
    const adapters = buildAdapters(['gemini', createMockAdapter('gemini', 'findings')]);

    const result = await executeParallelExploration(
      'Explore the codebase and find patterns',
      adapters
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.partitions[0]?.model).toBe('gemini-model');
  });

  it('detects task category from task text', async () => {
    const adapters = buildAdapters(['gemini', createMockAdapter('gemini', 'research findings')]);

    const result = await executeParallelExploration(
      'Research the latest consensus algorithms and compare approaches',
      adapters
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.category).toBe('research');
  });

  it('prefers CLIs in order: gemini, claude, codex', async () => {
    const adapters = buildAdapters(
      ['codex', createMockAdapter('codex', 'X')],
      ['claude', createMockAdapter('claude', 'C')],
      ['gemini', createMockAdapter('gemini', 'G')]
    );

    const result = await executeParallelExploration('Explore the codebase', adapters, {
      config: { maxParallelClis: 2 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const clis = result.value.partitions.map((p) => p.cli);
    expect(clis[0]).toBe('gemini');
    expect(clis[1]).toBe('claude');
  });
});
