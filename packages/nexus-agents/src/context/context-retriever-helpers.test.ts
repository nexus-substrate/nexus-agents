/**
 * Tests for the entry-point helpers (Phase 3 of #2792 / closes #2795):
 *  - `inferTaskCategory` — keyword-based fallback classifier.
 *  - `summarizeContextForPrompt` — compact human-readable rendering.
 *
 * @module context/context-retriever-helpers.test
 */

import { describe, expect, it } from 'vitest';
import { inferTaskCategory, summarizeContextForPrompt } from './context-retriever.js';
import type { UnifiedContext } from './context-retriever.js';
import { BeliefConfidence, BeliefSourceType } from './belief-core-types.js';

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
    outcomes: null,
    priorStrategies: [],
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
