/**
 * Tests for self-eval → tech-debt signal surfacing in improvement_review (#3224).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLogger,
  getTuneAdjustmentStore,
  resetTuneAdjustmentStore,
} from '../../core/index.js';
import { detectSelfEvalSignals, loadSelfEvalSignals } from './improvement-review.js';

const logger = createLogger({ component: 'test' });

interface SelfEvalEntry {
  component: string;
  finalRecommendation: string;
  confidence: number;
  dissent: unknown[];
  evidenceQuality?: number;
}

function result(over: Partial<SelfEvalEntry> = {}): SelfEvalEntry {
  return {
    component: 'src/foo.ts',
    finalRecommendation: 'deprecate',
    confidence: 0.95,
    dissent: [],
    ...over,
  };
}

describe('detectSelfEvalSignals (#3224)', () => {
  it('surfaces a high-confidence unanimous deprecate finding as a tech-debt signal', () => {
    const signals = detectSelfEvalSignals({ results: [result({})] }, '7d');
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      category: 'tech-debt',
      severity: 'warning',
      signalKey: 'tech-debt:self-eval:src/foo.ts:deprecate',
    });
  });

  it('surfaces refactor at lower (info) severity', () => {
    const signals = detectSelfEvalSignals(
      { results: [result({ finalRecommendation: 'refactor' })] },
      '7d'
    );
    expect(signals[0]?.severity).toBe('info');
  });

  it('ignores non-actionable recommendations (retain/review)', () => {
    const signals = detectSelfEvalSignals(
      {
        results: [
          result({ finalRecommendation: 'retain' }),
          result({ finalRecommendation: 'review' }),
        ],
      },
      '7d'
    );
    expect(signals).toHaveLength(0);
  });

  it('ignores findings with dissent (not unanimous)', () => {
    const signals = detectSelfEvalSignals(
      { results: [result({ dissent: [{ agent: 'code-quality' }] })] },
      '7d'
    );
    expect(signals).toHaveLength(0);
  });

  it('ignores low-confidence findings (below the 0.8 floor)', () => {
    const signals = detectSelfEvalSignals({ results: [result({ confidence: 0.7 })] }, '7d');
    expect(signals).toHaveLength(0);
  });

  it('is non-behavioral — surfacing a finding never touches routing (#3224 core guarantee)', () => {
    resetTuneAdjustmentStore();
    detectSelfEvalSignals({ results: [result({ finalRecommendation: 'deprecate' })] }, '7d');
    // The whole point of #3224's safe path: self-eval surfaces a human decision
    // point (an issue), it must NOT auto-demote any CLI in routing.
    expect(getTuneAdjustmentStore().demotionStats()).toHaveLength(0);
    expect(getTuneAdjustmentStore().list()).toHaveLength(0);
    resetTuneAdjustmentStore();
  });
});

describe('loadSelfEvalSignals (#3224 — fail-soft)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'nexus-selfeval-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads a valid report and returns signals', async () => {
    const path = join(dir, 'report.json');
    await writeFile(path, JSON.stringify({ results: [result({})] }));
    const signals = await loadSelfEvalSignals(path, '7d', logger);
    expect(signals).toHaveLength(1);
  });

  it('returns no signals for a missing file (never throws)', async () => {
    const signals = await loadSelfEvalSignals(join(dir, 'nope.json'), '7d', logger);
    expect(signals).toEqual([]);
  });

  it('returns no signals for malformed JSON', async () => {
    const path = join(dir, 'bad.json');
    await writeFile(path, '{ not json');
    expect(await loadSelfEvalSignals(path, '7d', logger)).toEqual([]);
  });

  it('returns no signals for a schema-mismatched report', async () => {
    const path = join(dir, 'wrong.json');
    await writeFile(path, JSON.stringify({ results: [{ component: 123 }] }));
    expect(await loadSelfEvalSignals(path, '7d', logger)).toEqual([]);
  });
});
