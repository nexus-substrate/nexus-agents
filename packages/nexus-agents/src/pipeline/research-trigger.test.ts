/**
 * Research Trigger Tests (#1715 — Central Workflow Hub)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecuteExpert } = vi.hoisted(() => ({
  mockExecuteExpert: vi.fn(),
}));

vi.mock('./expert-bridge.js', () => ({
  executeExpert: mockExecuteExpert,
}));

import { checkForResearchTriggers, checkForCapabilityGapTriggers } from './research-trigger.js';
import { createCapabilityGapLedger } from '../core/task-analysis/capability-gap-ledger.js';
import type { CapabilityGapReport } from '../core/task-analysis/capability-gap-detector.js';

/** Build a gap report with a single tool gap for ledger seeding. */
function toolGap(name: string): CapabilityGapReport {
  return {
    available: { tools: [], experts: [] },
    gaps: [{ type: 'tool', name, suggestion: 'use run_graph_workflow' }],
    allSatisfied: false,
  };
}

describe('checkForResearchTriggers', () => {
  beforeEach(() => {
    mockExecuteExpert.mockReset();
  });

  it('returns empty array when expert-bridge unavailable', async () => {
    mockExecuteExpert.mockResolvedValue({
      success: false,
      text: '',
      expertType: 'research',
      durationMs: 10,
      error: 'No adapters',
    });

    const tasks = await checkForResearchTriggers();
    expect(tasks).toEqual([]);
  });

  it('parses discoveries and filters by quality threshold', async () => {
    mockExecuteExpert.mockResolvedValue({
      success: true,
      text: [
        '- Multi-Agent Orchestration Framework (quality: 9)',
        '- Basic Chat Bot Tutorial (quality: 3)',
        '- Advanced LLM Routing Patterns (quality: 8)',
      ].join('\n'),
      expertType: 'research',
      durationMs: 500,
    });

    const tasks = await checkForResearchTriggers({ qualityThreshold: 7 });
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.title).toContain('Multi-Agent Orchestration Framework');
    expect(tasks[1]?.title).toContain('Advanced LLM Routing Patterns');
  });

  it('respects maxTriggers rate limit', async () => {
    mockExecuteExpert.mockResolvedValue({
      success: true,
      text: [
        '- Paper A (quality: 10)',
        '- Paper B (quality: 10)',
        '- Paper C (quality: 10)',
        '- Paper D (quality: 10)',
      ].join('\n'),
      expertType: 'research',
      durationMs: 300,
    });

    const tasks = await checkForResearchTriggers({ maxTriggers: 2 });
    expect(tasks).toHaveLength(2);
  });

  it('deduplicates against existing task IDs', async () => {
    mockExecuteExpert.mockResolvedValue({
      success: true,
      text: '- Known Paper Title (quality: 9)\n- New Paper (quality: 8)',
      expertType: 'research',
      durationMs: 200,
    });

    // First call to get the generated IDs
    const allTasks = await checkForResearchTriggers();
    expect(allTasks).toHaveLength(2);
    const knownId = allTasks[0]?.id ?? '';

    // Second call with dedup set containing the first ID
    mockExecuteExpert.mockResolvedValue({
      success: true,
      text: '- Known Paper Title (quality: 9)\n- New Paper (quality: 8)',
      expertType: 'research',
      durationMs: 200,
    });
    const existing = new Set([knownId]);
    const tasks = await checkForResearchTriggers({ existingTaskIds: existing });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toContain('New Paper');
  });

  it('sets correct task properties', async () => {
    mockExecuteExpert.mockResolvedValue({
      success: true,
      text: '- Test Research Paper (quality: 8)',
      expertType: 'research',
      durationMs: 100,
    });

    const tasks = await checkForResearchTriggers();
    expect(tasks[0]).toMatchObject({
      assignedTo: 'researcher',
      status: 'pending',
    });
    expect(tasks[0]?.description).toContain('quality: 8/10');
  });

  it('passes topic to research_discover', async () => {
    mockExecuteExpert.mockResolvedValue({
      success: true,
      text: '',
      expertType: 'research',
      durationMs: 50,
    });

    await checkForResearchTriggers({ topic: 'code review automation' });
    const call = mockExecuteExpert.mock.calls[0] as [string, string];
    expect(call[1]).toContain('code review automation');
  });

  it('returns empty on exception (graceful degradation)', async () => {
    mockExecuteExpert.mockRejectedValue(new Error('Network error'));
    const tasks = await checkForResearchTriggers();
    expect(tasks).toEqual([]);
  });
});

describe('checkForCapabilityGapTriggers (#3576)', () => {
  it('suggests a task for a gap that recurs at/above the threshold', () => {
    const ledger = createCapabilityGapLedger();
    for (let i = 0; i < 3; i++)
      ledger.record(toolGap('deploy'), { goal: `ship build ${String(i)}` });
    const tasks = checkForCapabilityGapTriggers({ ledger });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe('gap-tool-deploy');
    expect(tasks[0]?.title).toContain('deploy');
    expect(tasks[0]?.description).toContain('3x');
    expect(tasks[0]?.status).toBe('pending');
  });

  it('ignores gaps below minOccurrences', () => {
    const ledger = createCapabilityGapLedger();
    ledger.record(toolGap('deploy'));
    ledger.record(toolGap('deploy'));
    expect(checkForCapabilityGapTriggers({ ledger, minOccurrences: 3 })).toEqual([]);
  });

  it('dedups against existingTaskIds', () => {
    const ledger = createCapabilityGapLedger();
    for (let i = 0; i < 3; i++) ledger.record(toolGap('deploy'));
    const tasks = checkForCapabilityGapTriggers({
      ledger,
      existingTaskIds: new Set(['gap-tool-deploy']),
    });
    expect(tasks).toEqual([]);
  });

  it('caps at maxTriggers (most frequent first)', () => {
    const ledger = createCapabilityGapLedger();
    for (let i = 0; i < 5; i++) ledger.record(toolGap('deploy'));
    for (let i = 0; i < 4; i++) ledger.record(toolGap('scan'));
    for (let i = 0; i < 3; i++) ledger.record(toolGap('lint'));
    const tasks = checkForCapabilityGapTriggers({ ledger, maxTriggers: 2 });
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.id)).toEqual(['gap-tool-deploy', 'gap-tool-scan']);
  });

  it('returns empty for an empty ledger', () => {
    expect(checkForCapabilityGapTriggers({ ledger: createCapabilityGapLedger() })).toEqual([]);
  });
});
