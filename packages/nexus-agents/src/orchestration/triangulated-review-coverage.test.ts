/**
 * Triangulated review coverage-disclosure tests (#5301).
 *
 * `buildReviewPrompt` used `diff.slice(0, 6000)` while the prompt asserted
 * completeness ("Diff to review") and the result carried no coverage field. A
 * 6001-byte diff therefore produced output indistinguishable from a whole-diff
 * review — including the corroboration count, which reads as independent
 * confirmation.
 *
 * @module orchestration/triangulated-review-coverage.test
 */

import { describe, it, expect, vi } from 'vitest';
import { ok } from '../core/index.js';
import type { ICliAdapter, CliName, CliResponse } from '../cli-adapters/types.js';
import { executeTriangulatedReview } from './triangulated-review.js';

vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

/** An adapter that records the prompt it was handed. */
function capturingAdapter(name: CliName, seen: string[]): ICliAdapter {
  return {
    name,
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(request: { content: string }) {
      seen.push(request.content);
      const response: CliResponse = { text: '[]', model: `${name}-model` };
      return ok(response);
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

/** A unified diff of `fileCount` files, each padded past the byte budget. */
function makeDiff(fileCount: number, bytesPerFile: number): string {
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    const body = `+${'x'.repeat(bytesPerFile)}`;
    files.push(
      `diff --git a/src/file${String(i)}.ts b/src/file${String(i)}.ts\n` +
        `--- a/src/file${String(i)}.ts\n+++ b/src/file${String(i)}.ts\n@@ -1,1 +1,2 @@\n${body}\n`
    );
  }
  return files.join('');
}

function adapters(seen: string[]): ReadonlyMap<CliName, ICliAdapter> {
  return new Map<CliName, ICliAdapter>([
    ['claude', capturingAdapter('claude', seen)],
    ['gemini', capturingAdapter('gemini', seen)],
  ]);
}

describe('a whole-diff review is unchanged', () => {
  it('adds no partial-review note when the diff fits', async () => {
    const seen: string[] = [];
    const result = await executeTriangulatedReview(makeDiff(2, 50), adapters(seen), {
      config: { maxClis: 2 },
    });

    expect(result.ok).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    for (const prompt of seen) {
      expect(prompt).not.toContain('partial review');
    }
    if (result.ok) {
      expect(result.value.coverage).toBeUndefined();
    }
  });
});

describe('a bounded review says so', () => {
  const bigDiff = makeDiff(8, 2000);

  it('tells every reviewer that coverage is partial', async () => {
    const seen: string[] = [];
    const result = await executeTriangulatedReview(bigDiff, adapters(seen), {
      config: { maxClis: 2 },
    });

    expect(result.ok).toBe(true);
    expect(seen.length).toBe(2);
    for (const prompt of seen) {
      expect(prompt).toContain('partial review');
    }
  });

  it('hands every CLI the same subset, so corroboration stays meaningful', async () => {
    const seen: string[] = [];
    await executeTriangulatedReview(bigDiff, adapters(seen), { config: { maxClis: 2 } });

    // Two CLIs agreeing is the signal a reader trusts most. If they were shown
    // different subsets, agreement would mean less than it appears to. The
    // prompts differ by design (each CLI gets its own perspective line), so
    // compare the fenced diff block rather than the whole prompt.
    expect(seen).toHaveLength(2);
    const diffBlock = (prompt: string): string => prompt.split('```')[1] ?? '';
    expect(diffBlock(seen[0] ?? '')).toBe(diffBlock(seen[1] ?? ''));
    expect(diffBlock(seen[0] ?? '')).not.toBe('');
  });

  it('carries machine-readable coverage on the result', async () => {
    const seen: string[] = [];
    const result = await executeTriangulatedReview(bigDiff, adapters(seen), {
      config: { maxClis: 2 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const coverage = result.value.coverage;
    expect(coverage).toBeDefined();
    if (coverage === undefined) return;
    expect(coverage.partial).toBe(true);
    expect(coverage.reviewedFiles).toBeLessThan(coverage.totalFiles);
    expect(coverage.totalFiles).toBe(8);
  });

  it('states the coverage in the rendered summary', async () => {
    const seen: string[] = [];
    const result = await executeTriangulatedReview(bigDiff, adapters(seen), {
      config: { maxClis: 2 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The summary is what a human reads. Without this line a partial review is
    // presented exactly like a whole-diff one.
    expect(result.value.summary).toMatch(/partial|of 8 files/i);
  });
});
