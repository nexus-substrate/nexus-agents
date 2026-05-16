/**
 * Tests for ContextRetriever (Phase 2 of #2792 / closes #2794).
 *
 * Exercises the unified read surface with real shared singletons —
 * boots `ToolMemoryManager` in-process, writes beliefs, and verifies the
 * retriever returns them. Backend failure tolerance is exercised by
 * forcing one branch to throw via a substituted backend.
 *
 * @module context/context-retriever.test
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeMemoryRegistry, createInMemoryMemoryRegistry, setMemoryRegistry } from 'nexus-memory';
import { getContextForTask } from './context-retriever.js';
import { resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';

describe('getContextForTask', () => {
  let dataDir: string;
  let prevDataDir: string | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'context-retriever-'));
    prevDataDir = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dataDir;
    setMemoryRegistry(createInMemoryMemoryRegistry());
    resetOutcomeStore();
  });

  afterEach(async () => {
    await closeMemoryRegistry();
    if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = prevDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns an empty UnifiedContext shape when no backends have data', async () => {
    const { shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    shutdownToolMemory();

    const ctx = await getContextForTask({
      task: 'some unknown task',
      category: 'code_generation',
    });

    expect(ctx.beliefs).toEqual([]);
    expect(ctx.similarMemories).toEqual([]);
    expect(ctx.recentLearnings).toEqual([]);
    expect(ctx.experiencePatterns).toEqual([]);
    expect(ctx.priorStrategies).toEqual([]);
    // outcomes is a summary type — always present, just zeroed.
    expect(ctx.outcomes).not.toBeUndefined();
    expect(ctx.outcomes?.totalTasks).toBe(0);
  });

  it('returns matching beliefs after recordBelief writes', async () => {
    const { getToolMemory, shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    shutdownToolMemory();
    const tm = getToolMemory();

    await tm.recordBelief('arXiv:2502.12110', 'has_topic', 'agentic memory', 'high');
    await tm.recordBelief('arXiv:2310.08560', 'has_topic', 'adaptive memory', 'high');

    const ctx = await getContextForTask({
      task: 'arXiv:2502.12110',
      category: 'research',
    });

    expect(ctx.beliefs.length).toBeGreaterThanOrEqual(1);
    expect(ctx.beliefs.some((b) => b.subject === 'arXiv:2502.12110')).toBe(true);
  });

  it('honors limit', async () => {
    const { getToolMemory, shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    shutdownToolMemory();
    const tm = getToolMemory();

    for (let i = 0; i < 10; i++) {
      await tm.recordBelief(`subj-${String(i)}`, 'has_topic', 'shared topic', 'medium');
    }

    const ctx = await getContextForTask({
      task: 'subj-0',
      category: 'code_generation',
      limit: 3,
    });

    expect(ctx.beliefs.length).toBeLessThanOrEqual(3);
  });

  it('returns empty results without throwing when a backend errors', async () => {
    const { getToolMemory, shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    shutdownToolMemory();
    const tm = getToolMemory();

    // Substitute a belief backend that throws on every call.
    type BeliefMem = ReturnType<typeof tm.getBeliefMemory>;
    const exploding = {
      recallBySubject: (): Promise<never> => Promise.reject(new Error('boom')),
    };
    vi.spyOn(tm, 'getBeliefMemory').mockReturnValue(exploding as unknown as BeliefMem);

    const ctx = await getContextForTask({
      task: 'anything',
      category: 'code_generation',
    });

    expect(ctx.beliefs).toEqual([]);
    // Other branches still resolve.
    expect(ctx.outcomes).not.toBeUndefined();
  });

  it('outcomes summary scopes to the requested category', async () => {
    const { getToolMemory, shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    const { getOutcomeStore } = await import('../orchestration/outcomes/outcome-store.js');
    shutdownToolMemory();
    getToolMemory();

    const store = getOutcomeStore();
    store.append({
      id: 'o1',
      cli: 'claude',
      category: 'code_generation',
      model: 'claude-opus',
      success: true,
      durationMs: 100,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });
    store.append({
      id: 'o2',
      cli: 'claude',
      category: 'research',
      model: 'claude-opus',
      success: false,
      durationMs: 200,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });

    const ctx = await getContextForTask({
      task: 'irrelevant',
      category: 'code_generation',
    });

    expect(ctx.outcomes?.totalTasks).toBe(1);
    expect(ctx.outcomes?.successRate).toBe(1);
  });
});
