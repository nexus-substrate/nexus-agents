/**
 * Tests for triangulated code review — multi-CLI review dispatch and dedup.
 * (Source: Issue #864)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../core/index.js';
import type { ICliAdapter, CliName, CliResponse, CliError } from '../cli-adapters/types.js';
import { executeTriangulatedReview } from './triangulated-review.js';
import { createDefaultReviewConfig } from './triangulated-review-types.js';
import { resetOutcomeStore, getOutcomeStore } from './outcomes/index.js';

// Force in-memory outcome store (avoid hydrating from disk in tests)
vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

// ============================================================================
// Mock Adapter Factory
// ============================================================================

function createReviewAdapter(name: CliName, response: string, delay = 10): ICliAdapter {
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

function createFailingReviewAdapter(name: CliName): ICliAdapter {
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

/** JSON findings response from a mock CLI. */
function jsonFindings(...items: Array<Record<string, unknown>>): string {
  return JSON.stringify(items);
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  resetOutcomeStore();
  vi.restoreAllMocks();
});

describe('createDefaultReviewConfig', () => {
  it('returns expected defaults', () => {
    const config = createDefaultReviewConfig();
    expect(config.maxClis).toBe(3);
    expect(config.perCliTimeoutMs).toBe(300_000);
    expect(config.maxOutputCharsPerCli).toBe(8000);
    expect(config.lineProximity).toBe(5);
  });
});

describe('executeTriangulatedReview', () => {
  const sampleDiff = `--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,6 +10,8 @@\n function login(user) {\n+  const token = generateToken(user);\n+  return token;\n }`;

  it('dispatches review to multiple CLIs', async () => {
    const codexResponse = jsonFindings({
      category: 'code_quality',
      severity: 'medium',
      title: 'Missing error handling',
      description: 'No try/catch',
      file: 'src/auth.ts',
      line: 12,
    });
    const claudeResponse = jsonFindings({
      category: 'security',
      severity: 'high',
      title: 'Token not validated',
      description: 'Token generation lacks validation',
      file: 'src/auth.ts',
      line: 11,
    });

    const adapters = buildAdapters(
      ['codex', createReviewAdapter('codex', codexResponse)],
      ['claude', createReviewAdapter('claude', claudeResponse)]
    );

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toContain('codex');
    expect(result.value.clisUsed).toContain('claude');
    expect(result.value.findings.length).toBe(2);
    expect(result.value.partitions).toHaveLength(2);
  });

  it('deduplicates similar findings from different CLIs', async () => {
    const codexResponse = jsonFindings({
      category: 'security',
      severity: 'high',
      title: 'SQL injection',
      description: 'Unsanitized input',
      file: 'src/db.ts',
      line: 42,
    });
    const claudeResponse = jsonFindings({
      category: 'security',
      severity: 'high',
      title: 'SQL injection risk',
      description: 'Input not escaped',
      file: 'src/db.ts',
      line: 44,
    });

    const adapters = buildAdapters(
      ['codex', createReviewAdapter('codex', codexResponse)],
      ['claude', createReviewAdapter('claude', claudeResponse)]
    );

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Lines 42 and 44 are within default proximity (5), same file+category → deduplicated
    expect(result.value.findings.length).toBe(1);
    expect(result.value.findings[0]?.corroborationCount).toBe(2);
    expect(result.value.findings[0]?.reportedBy).toContain('codex');
    expect(result.value.findings[0]?.reportedBy).toContain('claude');
  });

  it('keeps distinct findings separate', async () => {
    const codexResponse = jsonFindings({
      category: 'performance',
      severity: 'medium',
      title: 'N+1 query',
      description: 'Loop query',
      file: 'src/api.ts',
      line: 10,
    });
    const claudeResponse = jsonFindings({
      category: 'security',
      severity: 'high',
      title: 'XSS',
      description: 'Unescaped output',
      file: 'src/render.ts',
      line: 55,
    });

    const adapters = buildAdapters(
      ['codex', createReviewAdapter('codex', codexResponse)],
      ['claude', createReviewAdapter('claude', claudeResponse)]
    );

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Different files and categories → NOT deduplicated
    expect(result.value.findings.length).toBe(2);
  });

  it('returns error when no adapters available', async () => {
    const adapters = buildAdapters();

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('No CLI adapters available');
  });

  it('handles partial CLI failures', async () => {
    const codexResponse = jsonFindings({
      category: 'code_quality',
      severity: 'low',
      title: 'Unused variable',
      description: 'x is unused',
      file: 'src/utils.ts',
      line: 5,
    });

    const adapters = buildAdapters(
      ['codex', createReviewAdapter('codex', codexResponse)],
      ['claude', createFailingReviewAdapter('claude')]
    );

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual(['codex']);
    expect(result.value.findings.length).toBe(1);
    expect(result.value.partitions).toHaveLength(2);

    const claudePartition = result.value.partitions.find((p) => p.cli === 'claude');
    expect(claudePartition?.success).toBe(false);
  });

  it('handles all CLIs failing', async () => {
    const adapters = buildAdapters(
      ['codex', createFailingReviewAdapter('codex')],
      ['claude', createFailingReviewAdapter('claude')]
    );

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual([]);
    expect(result.value.findings.length).toBe(0);
    expect(result.value.summary).toContain('All review CLIs failed');
  });

  it('handles unparseable CLI responses', async () => {
    const adapters = buildAdapters([
      'codex',
      createReviewAdapter('codex', 'Not JSON at all, just text'),
    ]);

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // A CLI whose output did not parse did not review anything (#5697): it is
    // not "used", and its partition says why. This test used to bless
    // clisUsed === ['codex'] with zero findings — a clean review from prose.
    expect(result.value.clisUsed).toEqual([]);
    expect(result.value.findings.length).toBe(0);
    const partition = result.value.partitions.find((p) => p.cli === 'codex');
    expect(partition?.success).toBe(false);
    expect(partition?.error).toContain('unparseable');
  });

  it('treats a literal empty findings array as a successful review with nothing to report (#5697)', async () => {
    const adapters = buildAdapters(['codex', createReviewAdapter('codex', '[]')]);

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual(['codex']);
    expect(result.value.findings.length).toBe(0);
    expect(result.value.partitions.find((p) => p.cli === 'codex')?.success).toBe(true);
  });

  it('sorts findings by severity then confidence', async () => {
    const codexResponse = jsonFindings(
      {
        category: 'code_quality',
        severity: 'low',
        title: 'Style issue',
        description: 'Minor',
        file: 'a.ts',
        line: 1,
      },
      {
        category: 'security',
        severity: 'critical',
        title: 'RCE',
        description: 'Remote code execution',
        file: 'b.ts',
        line: 1,
      },
      {
        category: 'performance',
        severity: 'medium',
        title: 'Slow query',
        description: 'N+1',
        file: 'c.ts',
        line: 1,
      }
    );

    const adapters = buildAdapters(['codex', createReviewAdapter('codex', codexResponse)]);

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.findings[0]?.finding.severity).toBe('critical');
    expect(result.value.findings[1]?.finding.severity).toBe('medium');
    expect(result.value.findings[2]?.finding.severity).toBe('low');
  });

  it('counts findings by severity', async () => {
    const codexResponse = jsonFindings(
      {
        category: 'security',
        severity: 'critical',
        title: 'A',
        description: 'A',
        file: 'a.ts',
        line: 1,
      },
      {
        category: 'security',
        severity: 'high',
        title: 'B',
        description: 'B',
        file: 'b.ts',
        line: 1,
      },
      {
        category: 'code_quality',
        severity: 'low',
        title: 'C',
        description: 'C',
        file: 'c.ts',
        line: 1,
      }
    );

    const adapters = buildAdapters(['codex', createReviewAdapter('codex', codexResponse)]);

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.countBySeverity.critical).toBe(1);
    expect(result.value.countBySeverity.high).toBe(1);
    expect(result.value.countBySeverity.low).toBe(1);
    expect(result.value.countBySeverity.medium).toBe(0);
  });

  it('records task outcomes', async () => {
    const adapters = buildAdapters(
      ['codex', createReviewAdapter('codex', '[]')],
      ['claude', createReviewAdapter('claude', '[]')]
    );

    await executeTriangulatedReview(sampleDiff, adapters);

    const outcomes = getOutcomeStore().query({});
    expect(outcomes.length).toBe(2);
    expect(outcomes.map((o) => o.cli).sort()).toEqual(['claude', 'codex']);
    expect(outcomes.every((o) => o.category === 'code_review')).toBe(true);
  });

  it('prefers CLIs in order: codex, claude, gemini', async () => {
    const adapters = buildAdapters(
      ['gemini', createReviewAdapter('gemini', '[]')],
      ['claude', createReviewAdapter('claude', '[]')],
      ['codex', createReviewAdapter('codex', '[]')]
    );

    const result = await executeTriangulatedReview(sampleDiff, adapters, {
      config: { maxClis: 2 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const clis = result.value.partitions.map((p) => p.cli);
    expect(clis[0]).toBe('codex');
    expect(clis[1]).toBe('claude');
  });

  it('applies confidence bonus per CLI', async () => {
    const codexResponse = jsonFindings({
      category: 'code_quality',
      severity: 'medium',
      title: 'Issue',
      description: 'Desc',
      file: 'a.ts',
      line: 1,
    });

    const adapters = buildAdapters(['codex', createReviewAdapter('codex', codexResponse)]);

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Codex gets 0.7 base + 0.15 bonus = 0.85
    expect(result.value.findings[0]?.weightedConfidence).toBeCloseTo(0.85, 2);
  });

  it('works with single CLI', async () => {
    const response = jsonFindings({
      category: 'testing',
      severity: 'medium',
      title: 'Missing test',
      description: 'No unit test',
      file: 'src/auth.ts',
      line: 10,
    });

    const adapters = buildAdapters(['claude', createReviewAdapter('claude', response)]);

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clisUsed).toEqual(['claude']);
    expect(result.value.findings.length).toBe(1);
  });

  it('dedup does not merge findings in different files', async () => {
    const codexResponse = jsonFindings({
      category: 'security',
      severity: 'high',
      title: 'XSS',
      description: 'Issue',
      file: 'a.ts',
      line: 10,
    });
    const claudeResponse = jsonFindings({
      category: 'security',
      severity: 'high',
      title: 'XSS',
      description: 'Issue',
      file: 'b.ts',
      line: 10,
    });

    const adapters = buildAdapters(
      ['codex', createReviewAdapter('codex', codexResponse)],
      ['claude', createReviewAdapter('claude', claudeResponse)]
    );

    const result = await executeTriangulatedReview(sampleDiff, adapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Different files → separate findings
    expect(result.value.findings.length).toBe(2);
  });
});
