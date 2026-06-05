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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeMemoryRegistry, createInMemoryMemoryRegistry, setMemoryRegistry } from 'nexus-memory';
import {
  getContextForTask,
  selectRelevantResearch,
  summarizeContextForPrompt,
  type UnifiedContext,
} from './context-retriever.js';
import { resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { DistilledRule } from '../learning/strategy-distiller-types.js';
import type { TechniqueStatusSummary } from '../cli/research-types.js';

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

  // ========================================================================
  // Phase 5 of #2792 — priorStrategies populated from persisted rules.json
  // ========================================================================

  function makeRule(overrides: Partial<DistilledRule> = {}): DistilledRule {
    return {
      id: 'failure-rate:codex:code_generation',
      patternType: 'failure-rate',
      cli: 'codex',
      category: 'code_generation',
      action: 'penalize',
      confidence: 0.85,
      observationCount: 50,
      metric: 0.7,
      status: 'active',
      createdAt: 1000,
      updatedAt: 2000,
      tainted: false,
      ...overrides,
    };
  }

  function writeRulesFile(rules: readonly DistilledRule[]): void {
    const dir = join(dataDir, 'learning');
    mkdirSync(dir, { recursive: true });
    const snapshot = { version: 1, savedAt: new Date().toISOString(), rules };
    writeFileSync(join(dir, 'rules.json'), JSON.stringify(snapshot));
  }

  it('priorStrategies surfaces active rules matching the task category', async () => {
    const { shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    shutdownToolMemory();

    writeRulesFile([
      makeRule({ id: 'r-match-1', category: 'code_generation' }),
      makeRule({ id: 'r-match-2', category: 'code_generation', cli: 'gemini', action: 'boost' }),
      makeRule({ id: 'r-other', category: 'research' }),
    ]);

    const ctx = await getContextForTask({ task: 'anything', category: 'code_generation' });

    expect(ctx.priorStrategies.length).toBeGreaterThanOrEqual(2);
    const matchIds = ctx.priorStrategies.map((r) => r.id);
    expect(matchIds).toContain('r-match-1');
    expect(matchIds).toContain('r-match-2');
    expect(matchIds).not.toContain('r-other');
  });

  it('priorStrategies excludes tainted rules (security gate)', async () => {
    const { shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    shutdownToolMemory();

    writeRulesFile([
      makeRule({ id: 'clean', tainted: false }),
      makeRule({ id: 'tainted', tainted: true }),
    ]);

    const ctx = await getContextForTask({ task: 'anything', category: 'code_generation' });
    const ids = ctx.priorStrategies.map((r) => r.id);
    expect(ids).toContain('clean');
    expect(ids).not.toContain('tainted');
  });

  it('priorStrategies excludes non-active rules', async () => {
    const { shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    shutdownToolMemory();

    writeRulesFile([
      makeRule({ id: 'active-one', status: 'active' }),
      makeRule({ id: 'draft-one', status: 'draft' }),
      makeRule({ id: 'expired-one', status: 'expired' }),
      makeRule({ id: 'promoted-one', status: 'promoted' }),
    ]);

    const ctx = await getContextForTask({ task: 'anything', category: 'code_generation' });
    const ids = ctx.priorStrategies.map((r) => r.id);
    expect(ids).toEqual(['active-one']);
  });

  it('priorStrategies returns [] when no rules file exists', async () => {
    const { shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    shutdownToolMemory();

    const ctx = await getContextForTask({ task: 'anything', category: 'code_generation' });
    expect(ctx.priorStrategies).toEqual([]);
  });

  it('priorStrategies honors limit', async () => {
    const { shutdownToolMemory } = await import('../mcp/tools/tool-memory.js');
    shutdownToolMemory();

    const many = Array.from({ length: 20 }, (_, i) =>
      makeRule({ id: `r-${String(i)}`, category: 'code_generation' })
    );
    writeRulesFile(many);

    const ctx = await getContextForTask({
      task: 'anything',
      category: 'code_generation',
      limit: 3,
    });
    expect(ctx.priorStrategies.length).toBe(3);
  });
});

// ============================================================================
// selectRelevantResearch — research→context relevance filter (#3148)
// ============================================================================

function makeTechnique(over: Partial<TechniqueStatusSummary>): TechniqueStatusSummary {
  return {
    id: over.id ?? 't-1',
    name: over.name ?? 'Some Technique',
    status: over.status ?? 'planned',
    priority: over.priority ?? 'P2',
    topic: over.topic ?? 'general',
    implementationIssue: over.implementationIssue ?? null,
  };
}

describe('selectRelevantResearch', () => {
  it('returns empty when there are no techniques', () => {
    expect(selectRelevantResearch([], 'speculative decoding', 5)).toEqual([]);
  });

  it('returns empty when the task has no discriminating (≥4-char) tokens', () => {
    const techs = [makeTechnique({ topic: 'caching' })];
    expect(selectRelevantResearch(techs, 'a to do it', 5)).toEqual([]);
  });

  it('matches techniques sharing a word with the task topic/name', () => {
    const techs = [
      makeTechnique({ id: 'a', name: 'Speculative Decoding', topic: 'inference' }),
      makeTechnique({ id: 'b', name: 'Prompt Caching', topic: 'caching' }),
    ];
    // "decoding" overlaps the first technique's name; the second shares nothing.
    const result = selectRelevantResearch(techs, 'add speculative decoding to the runtime', 5);
    expect(result.map((t) => t.id)).toEqual(['a']);
  });

  it('respects the limit and preserves registry order', () => {
    const techs = [
      makeTechnique({ id: 'a', topic: 'routing' }),
      makeTechnique({ id: 'b', topic: 'routing' }),
      makeTechnique({ id: 'c', topic: 'routing' }),
    ];
    const result = selectRelevantResearch(techs, 'improve routing decisions', 2);
    expect(result.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('ignores short shared tokens that are too generic to anchor relevance', () => {
    const techs = [makeTechnique({ id: 'a', name: 'API', topic: 'web' })];
    // "api"/"web" are <4 chars → no match even though the word appears.
    expect(selectRelevantResearch(techs, 'design the api for web', 5)).toEqual([]);
  });
});

// ============================================================================
// summarizeContextForPrompt — research section rendering (#3148)
// ============================================================================

function emptyContext(over: Partial<UnifiedContext> = {}): UnifiedContext {
  return {
    beliefs: [],
    similarMemories: [],
    recentLearnings: [],
    experiencePatterns: [],
    outcomes: null,
    priorStrategies: [],
    researchInsights: [],
    ...over,
  };
}

describe('summarizeContextForPrompt — research insights', () => {
  it('renders a Prior research section with name, status, and topic', () => {
    const ctx = emptyContext({
      researchInsights: [
        makeTechnique({ name: 'Speculative Decoding', status: 'rejected', topic: 'inference' }),
      ],
    });
    const out = summarizeContextForPrompt(ctx);
    expect(out).toContain('### Prior research on this topic');
    expect(out).toContain('- Speculative Decoding (rejected) — inference');
  });

  it('omits the research section entirely when there are no insights', () => {
    expect(summarizeContextForPrompt(emptyContext())).toBe('');
  });
});
