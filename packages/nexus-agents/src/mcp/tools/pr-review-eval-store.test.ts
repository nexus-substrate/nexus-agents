/**
 * Round-trip persistence tests for the per-voter pr_review eval store (#3848).
 *
 * Mirrors the PersistentOutcomeStore JSONL idiom: append -> JSONL line ->
 * hydrate on construction -> query. Asserts the report computed from a hydrated
 * store equals the report from the in-memory verdicts (persistence is lossless
 * for the metric).
 *
 * @module mcp/tools/pr-review-eval-store.test
 * (Source: #3848)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PrReviewEvalStore } from './pr-review-eval-store.js';
import { computePerVoterPrecisionRecall } from './pr-review-eval-scoring.js';
import type { VoterEvalVerdict } from './pr-review-eval-types.js';

let dir: string;
let file: string;

const TS = '2026-06-17T00:00:00Z';

function verdict(over: Partial<VoterEvalVerdict>): VoterEvalVerdict {
  return {
    id: 'r1:c1:architect',
    runId: 'r1',
    caseNumber: 'c1',
    caseClass: 'buggy',
    role: 'architect',
    truePositives: 1,
    falsePositives: 0,
    falseNegatives: 0,
    rubricVersion: '1.0.0',
    timestamp: TS,
    ...over,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pr-eval-store-'));
  file = join(dir, 'pr-review-eval.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('PrReviewEvalStore (#3848 persistence)', () => {
  it('appends verdicts to a JSONL file and queries them back in-memory', () => {
    const store = new PrReviewEvalStore({ filePath: file });
    store.append(verdict({ id: 'r1:a:security', role: 'security', caseNumber: 'a' }));
    store.append(verdict({ id: 'r1:b:devex', role: 'devex', caseNumber: 'b' }));

    expect(store.size).toBe(2);
    expect(existsSync(file)).toBe(true);
    expect(store.query({ role: 'security' })).toHaveLength(1);
    expect(store.query({ role: 'security' })[0]?.caseNumber).toBe('a');
  });

  it('round-trips through disk: a fresh store hydrates the same verdicts', () => {
    const writer = new PrReviewEvalStore({ filePath: file });
    const verdicts = [
      verdict({ id: 'r1:a:security', role: 'security', caseNumber: 'a', truePositives: 2 }),
      verdict({
        id: 'r1:b:security',
        role: 'security',
        caseNumber: 'b',
        caseClass: 'clean',
        truePositives: 0,
        falsePositives: 1,
      }),
      verdict({
        id: 'r1:c:architect',
        role: 'architect',
        caseNumber: 'c',
        falseNegatives: 1,
        truePositives: 0,
      }),
    ];
    for (const v of verdicts) writer.append(v);

    const reader = new PrReviewEvalStore({ filePath: file });
    expect(reader.size).toBe(3);

    // Report from hydrated store === report from raw verdicts (lossless metric).
    const fromDisk = computePerVoterPrecisionRecall(reader.query());
    const fromMemory = computePerVoterPrecisionRecall(verdicts);
    expect(fromDisk).toEqual(fromMemory);
    expect(fromDisk.byRole.security.precision).toBeCloseTo(2 / 3);
  });

  it('skips malformed JSONL lines on hydration (graceful degradation)', () => {
    writeFileSync(
      file,
      [
        JSON.stringify(verdict({ id: 'ok:1', role: 'security' })),
        'this is not json',
        JSON.stringify({ id: 'bad', role: 'not-a-role' }), // schema-invalid
        JSON.stringify(verdict({ id: 'ok:2', role: 'devex' })),
        '',
      ].join('\n'),
      'utf-8'
    );
    const store = new PrReviewEvalStore({ filePath: file });
    expect(store.size).toBe(2);
  });

  it('starts empty when no file exists', () => {
    const store = new PrReviewEvalStore({ filePath: join(dir, 'absent.jsonl') });
    expect(store.size).toBe(0);
    expect(store.query()).toEqual([]);
  });

  it('filters by runId, caseClass, since, and limit', () => {
    const store = new PrReviewEvalStore({ filePath: file });
    store.append(
      verdict({ id: '1', runId: 'r1', caseClass: 'buggy', timestamp: '2026-06-01T00:00:00Z' })
    );
    store.append(
      verdict({ id: '2', runId: 'r2', caseClass: 'clean', timestamp: '2026-06-10T00:00:00Z' })
    );
    store.append(
      verdict({ id: '3', runId: 'r2', caseClass: 'buggy', timestamp: '2026-06-20T00:00:00Z' })
    );

    expect(store.query({ runId: 'r2' })).toHaveLength(2);
    expect(store.query({ caseClass: 'clean' })).toHaveLength(1);
    expect(store.query({ since: '2026-06-10T00:00:00Z' })).toHaveLength(2);
    expect(store.query({ limit: 1 })).toHaveLength(1);
  });

  it('reportPrecisionRecall() returns the per-voter report over the queried window', () => {
    const store = new PrReviewEvalStore({ filePath: file });
    store.append(verdict({ id: '1', role: 'security', truePositives: 3, falseNegatives: 1 }));
    store.append(
      verdict({
        id: '2',
        role: 'security',
        caseNumber: 'x',
        caseClass: 'clean',
        truePositives: 0,
        falsePositives: 1,
      })
    );

    const report = store.reportPrecisionRecall({ role: 'security' });
    expect(report.byRole.security.truePositives).toBe(3);
    expect(report.byRole.security.precision).toBeCloseTo(0.75);
    expect(report.byRole.security.recall).toBeCloseTo(0.75);
  });
});
