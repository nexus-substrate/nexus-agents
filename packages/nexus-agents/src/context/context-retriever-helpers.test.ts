/**
 * Tests for the entry-point helpers (Phase 3 of #2792 / closes #2795):
 *  - `inferTaskCategory` — keyword-based fallback classifier.
 *  - `summarizeContextForPrompt` — compact human-readable rendering.
 *
 * Plus the unified memory cross-ranker (#3236): `rankMemories` /
 * `topRankedWithinBudget` — scoring monotonicity, cross-source ordering,
 * budget truncation, and the fail-soft contract.
 *
 * @module context/context-retriever-helpers.test
 */

import { describe, expect, it } from 'vitest';
import { inferTaskCategory, summarizeContextForPrompt } from './context-retriever.js';
import type { UnifiedContext } from './context-retriever.js';
import { BeliefConfidence, BeliefSourceType } from './belief-core-types.js';
import {
  assembleClampedContext,
  rankMemories,
  topRankedWithinBudget,
  type RankedMemoryItem,
} from './context-retriever-helpers.js';
import type { Belief } from './belief-core-types.js';
import type { AgenticMemoryEntry } from './agentic-memory-types.js';
import type { ScoredMemoryEntry } from './adaptive-memory-types.js';
import type { ExperienceEntry } from './mobimem-types.js';
import type { DistilledRule } from '../learning/strategy-distiller-types.js';
import type { TechniqueStatusSummary } from '../cli/research-types.js';

describe('inferTaskCategory', () => {
  it.each<[string, ReturnType<typeof inferTaskCategory>]>([
    ['Find SQL injection vulnerabilities in auth.ts', 'security_review'],
    ['Draft an ADR for the routing rewrite', 'architecture'],
    ['Add Vitest coverage for the memory module', 'testing'],
    ['Review this PR for performance regressions', 'code_review'],
    ['Update the README with the new install steps', 'documentation'],
    ['Plan the epic breakdown for memory unification', 'planning'],
    ['Research Zettelkasten approaches in agents', 'research'],
    ['Deploy the new image via Kubernetes', 'devops'],
    ['Implement the new feature flag', 'code_generation'],
    ['Just some random text with no signal', 'exploration'],
  ])('classifies %j as %s', (task, expected) => {
    expect(inferTaskCategory(task)).toBe(expected);
  });
});

describe('summarizeContextForPrompt', () => {
  const emptyCtx: UnifiedContext = {
    beliefs: [],
    similarMemories: [],
    recentLearnings: [],
    experiencePatterns: [],
    rankedMemories: [],
    outcomes: null,
    priorStrategies: [],
    researchInsights: [],
  };

  it('returns an empty string when nothing is known', () => {
    expect(summarizeContextForPrompt(emptyCtx)).toBe('');
  });

  it('renders only the sections with data', () => {
    const ctx: UnifiedContext = {
      ...emptyCtx,
      beliefs: [
        {
          beliefId: 'b1',
          subject: 'arXiv:2502.12110',
          predicate: 'has_topic',
          object: 'agentic memory',
          confidence: BeliefConfidence.HIGH,
          sourceType: BeliefSourceType.OBSERVATION,
          version: 1,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          superseded: false,
        },
      ],
    };
    const summary = summarizeContextForPrompt(ctx);
    expect(summary).toContain('## Prior Context (Nexus Memory)');
    expect(summary).toContain('### Beliefs');
    expect(summary).toContain('arXiv:2502.12110');
    expect(summary).not.toContain('### Similar prior work'); // empty section skipped
    expect(summary).not.toContain('### Observed patterns');
    expect(summary).not.toContain('### Outcomes for this category');
  });

  it('includes outcomes only when there are observed tasks', () => {
    const withOutcomes: UnifiedContext = {
      ...emptyCtx,
      outcomes: {
        totalTasks: 12,
        successRate: 0.75,
        avgDurationMs: 1234,
        byCli: new Map(),
        byCategory: new Map(),
      },
    };
    const summary = summarizeContextForPrompt(withOutcomes);
    expect(summary).toContain('### Outcomes for this category');
    expect(summary).toContain('12 prior tasks');
    expect(summary).toContain('75% success');
  });

  it('caps each section at a small number of entries to keep the prefix small', () => {
    const many: UnifiedContext = {
      ...emptyCtx,
      beliefs: Array.from({ length: 20 }, (_, i) => ({
        beliefId: `b${String(i)}`,
        subject: `subj-${String(i)}`,
        predicate: 'p',
        object: 'o',
        confidence: BeliefConfidence.MEDIUM,
        sourceType: BeliefSourceType.OBSERVATION,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        superseded: false,
      })),
    };
    const summary = summarizeContextForPrompt(many);
    expect(summary).toContain('subj-0');
    expect(summary).toContain('subj-4');
    expect(summary).not.toContain('subj-10');
  });
});

// ===========================================================================
// rankMemories / topRankedWithinBudget — unified cross-ranker (#3236)
// ===========================================================================

const RANK_NOW = Date.UTC(2026, 5, 7);
const DAY_MS = 24 * 60 * 60 * 1000;

function makeBelief(overrides: Partial<Belief> = {}): Belief {
  return {
    beliefId: 'b1',
    subject: 'authentication',
    predicate: 'requires',
    object: 'token refresh',
    confidence: 'high',
    sourceType: 'observation',
    version: 1,
    createdAt: new Date(RANK_NOW - DAY_MS),
    updatedAt: new Date(RANK_NOW - DAY_MS),
    superseded: false,
    ...overrides,
  };
}

function makeAgentic(text: string, ageMs: number): AgenticMemoryEntry {
  return {
    key: 'a1',
    value: text,
    metadata: { importance: 'medium' },
    createdAt: new Date(RANK_NOW - ageMs),
    accessedAt: new Date(RANK_NOW - ageMs),
    attributes: {
      keywords: [],
      semanticTags: [],
      contextDescription: text,
      entities: [],
      attributesUpdatedAt: new Date(RANK_NOW - ageMs),
    },
  };
}

function makeScored(text: string, ageMs: number): ScoredMemoryEntry {
  return {
    entry: {
      key: 'm1',
      value: text,
      metadata: { importance: 'medium' },
      createdAt: new Date(RANK_NOW - ageMs),
      accessedAt: new Date(RANK_NOW - ageMs),
    },
    priority: { score: 0.5, components: { recency: 0.5, importance: 0.5, relevance: 0.5 } },
  };
}

function makeExperience(overrides: Partial<ExperienceEntry> = {}): ExperienceEntry {
  return {
    id: 'e1',
    taskType: 'authentication flow',
    actionSequence: [],
    outcome: { success: true, totalDurationMs: 1000, tokensUsed: 500 },
    contextSignature: 'auth',
    successCount: 19,
    attemptCount: 20,
    successRate: 0.95,
    createdAt: new Date(RANK_NOW - 180 * DAY_MS),
    lastUsedAt: new Date(RANK_NOW - 180 * DAY_MS),
    ...overrides,
  };
}

function makeRule(overrides: Partial<DistilledRule> = {}): DistilledRule {
  return {
    id: 'r1',
    patternType: 'success-rate',
    cli: 'claude',
    category: 'code_generation',
    action: 'boost',
    confidence: 0.8,
    support: 0.8,
    effect: 1,
    observationCount: 40,
    metric: 0.9,
    status: 'active',
    createdAt: RANK_NOW - 2 * DAY_MS,
    updatedAt: RANK_NOW - 2 * DAY_MS,
    tainted: false,
    ...overrides,
  };
}

function makeResearch(overrides: Partial<TechniqueStatusSummary> = {}): TechniqueStatusSummary {
  return {
    id: 't1',
    name: 'token refresh strategy',
    status: 'implemented',
    priority: 'P1',
    topic: 'authentication',
    implementationIssue: 123,
    ...overrides,
  };
}

function emptyCtx(overrides: Partial<UnifiedContext> = {}): UnifiedContext {
  return {
    beliefs: [],
    similarMemories: [],
    recentLearnings: [],
    experiencePatterns: [],
    rankedMemories: [],
    outcomes: null,
    priorStrategies: [],
    researchInsights: [],
    ...overrides,
  };
}

describe('rankMemories — scoring monotonicity', () => {
  it('ranks a text-matching belief above a non-matching one', () => {
    const match = makeBelief({ beliefId: 'match', subject: 'authentication token refresh' });
    const noMatch = makeBelief({
      beliefId: 'nomatch',
      subject: 'database migration',
      predicate: 'uses',
      object: 'flyway',
    });
    const ranked = rankMemories(emptyCtx({ beliefs: [noMatch, match] }), 'authentication token', {
      now: RANK_NOW,
    });
    expect(ranked[0]?.item).toBe(match);
    expect(ranked[0]!.relevanceScore).toBeGreaterThan(ranked[1]!.relevanceScore);
  });

  it('ranks a recent item above an older identical-text item', () => {
    const recent = makeAgentic('authentication token refresh', DAY_MS);
    const old = makeAgentic('authentication token refresh', 365 * DAY_MS);
    const ranked = rankMemories(
      emptyCtx({ similarMemories: [old, recent] }),
      'authentication token',
      {
        now: RANK_NOW,
      }
    );
    expect(ranked[0]?.item).toBe(recent);
    expect(ranked[1]?.item).toBe(old);
  });

  it('uses source weight as a tie-break when text + recency are equal', () => {
    const belief = makeBelief({ subject: 'shared topic phrase', predicate: 'x', object: 'y' });
    const agentic = makeAgentic('shared topic phrase x y', DAY_MS);
    const ranked = rankMemories(
      emptyCtx({ beliefs: [belief], similarMemories: [agentic] }),
      'shared topic phrase',
      { now: RANK_NOW }
    );
    expect(ranked).toHaveLength(2);
    // belief carries the higher SOURCE_WEIGHT, so it wins an otherwise-even race.
    expect(ranked[0]?.source).toBe('belief');
  });
});

describe('rankMemories — cross-source ordering', () => {
  it('can rank an old high-confidence experience pattern above a recent low-text belief', () => {
    const strongOldPattern = makeExperience({
      taskType: 'authentication token refresh flow',
      createdAt: new Date(RANK_NOW - 200 * DAY_MS),
      lastUsedAt: new Date(RANK_NOW - 200 * DAY_MS),
    });
    const recentWeakBelief = makeBelief({
      subject: 'unrelated topic',
      predicate: 'is',
      object: 'noise',
      createdAt: new Date(RANK_NOW - 60 * 1000),
      updatedAt: new Date(RANK_NOW - 60 * 1000),
    });
    const ranked = rankMemories(
      emptyCtx({ beliefs: [recentWeakBelief], experiencePatterns: [strongOldPattern] }),
      'authentication token refresh',
      { now: RANK_NOW }
    );
    expect(ranked[0]?.source).toBe('experience');
  });

  it('includes every non-outcome source and excludes the aggregate outcomes summary', () => {
    const ctx = emptyCtx({
      beliefs: [makeBelief()],
      similarMemories: [makeAgentic('agentic note', DAY_MS)],
      recentLearnings: [makeScored('adaptive note', DAY_MS)],
      experiencePatterns: [makeExperience()],
      priorStrategies: [makeRule()],
      researchInsights: [makeResearch()],
      outcomes: { totalTasks: 10, successRate: 0.9 } as UnifiedContext['outcomes'],
    });
    const ranked = rankMemories(ctx, 'authentication', { now: RANK_NOW });
    expect(new Set(ranked.map((r) => r.source))).toEqual(
      new Set(['belief', 'agentic', 'adaptive', 'experience', 'strategy', 'research'])
    );
  });
});

describe('topRankedWithinBudget — truncation', () => {
  function rankedItem(source: RankedMemoryItem['source'], text: string): RankedMemoryItem {
    return { source, relevanceScore: 0.5, item: text, text, ageMs: 0, sourceConfidence: 0.5 };
  }

  it('returns only as many items as fit in the token budget', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      rankedItem('belief', `item number ${String(i)} with enough words to cost tokens`)
    );
    const kept = topRankedWithinBudget(items, 20);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(items.length);
  });

  it('returns all items when the budget is generous', () => {
    const items = [rankedItem('belief', 'one'), rankedItem('agentic', 'two')];
    expect(topRankedWithinBudget(items, 10_000)).toHaveLength(2);
  });

  it('returns an empty list for a zero budget', () => {
    expect(topRankedWithinBudget([rankedItem('belief', 'x')], 0)).toEqual([]);
  });
});

describe('rankMemories — fail-soft', () => {
  it('returns an empty list for fully empty backends without throwing', () => {
    expect(rankMemories(emptyCtx(), 'anything')).toEqual([]);
  });

  it('treats missing/invalid timestamps as neutral recency without throwing', () => {
    const noDate = makeAgentic('authentication note', DAY_MS);
    const broken: AgenticMemoryEntry = { ...noDate, createdAt: new Date('not-a-date') };
    expect(() =>
      rankMemories(emptyCtx({ similarMemories: [broken] }), 'authentication', { now: RANK_NOW })
    ).not.toThrow();
    const ranked = rankMemories(emptyCtx({ similarMemories: [broken] }), 'authentication', {
      now: RANK_NOW,
    });
    expect(ranked).toHaveLength(1);
    expect(Number.isFinite(ranked[0]!.relevanceScore)).toBe(true);
  });
});

describe('assembleClampedContext — source attribution (#5588)', () => {
  it('attributes the separator to an unclipped repo-map section', () => {
    expect(assembleClampedContext('memory', 'map', 100, 30)).toEqual({
      text: 'memory\n\nmap',
      memory: 'memory',
      repoMap: '\n\nmap',
    });
  });

  it('attributes the clip notice to memory when no repo-map content is retained', () => {
    const result = assembleClampedContext('m'.repeat(1000), 'map', 10, 0);
    expect(result.memory).toBe(result.text);
    expect(result.repoMap).toBe('');
  });

  it('attributes a retained map prefix and clip notice to the repo-map section', () => {
    const result = assembleClampedContext('memory', 'x'.repeat(1000), 10, 0);
    expect(result.memory).toBe('memory');
    expect(result.repoMap).toContain('\n\n');
    expect(`${result.memory}${result.repoMap}`).toBe(result.text);
  });

  it('attributes a partially retained separator to the repo-map section', () => {
    const result = assembleClampedContext('1234567', 'map', 2, 0);
    expect(result.repoMap).toContain('\n');
    expect(`${result.memory}${result.repoMap}`).toBe(result.text);
  });
});
