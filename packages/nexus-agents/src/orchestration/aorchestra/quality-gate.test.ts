/**
 * Tests for quality gates (#1502).
 *
 * @module orchestration/aorchestra/quality-gate.test
 */

import { describe, it, expect } from 'vitest';
import { applyQualityGate, createQaGate } from './quality-gate.js';
import type { WorkerResult } from './worker-dispatcher.js';

const makeResult = (output: string, status: WorkerResult['status'] = 'success'): WorkerResult => ({
  role: 'code',
  subTask: 'implement feature',
  output,
  status,
  durationMs: 100,
});

describe('quality-gate', () => {
  describe('applyQualityGate', () => {
    it('returns original result when gate passes', () => {
      const original = makeResult('valid output here');
      const result = applyQualityGate(original, () => undefined);
      expect(result).toBe(original);
    });

    it('returns error result when gate rejects', () => {
      const original = makeResult('bad');
      const result = applyQualityGate(original, () => 'too bad');
      expect(result.status).toBe('error');
      expect(result.error).toContain('Quality gate: too bad');
      expect(result.role).toBe('code');
    });

    it('preserves original fields in rejected result', () => {
      const original = makeResult('x');
      const result = applyQualityGate(original, () => 'rejected');
      expect(result.subTask).toBe(original.subTask);
      expect(result.durationMs).toBe(original.durationMs);
    });
  });

  describe('createQaGate', () => {
    it("maps a 'reject' verdict to a 'QA reject: <feedback>' rejection reason", async () => {
      const gate = createQaGate(() =>
        Promise.resolve({
          verdict: 'reject' as const,
          feedback: 'Output contradicts the spec',
          issues: ['contradiction'],
        })
      );

      await expect(gate(makeResult('some worker output here'))).resolves.toBe(
        'QA reject: Output contradicts the spec'
      );
    });

    it("returns undefined (pass) for a 'pass' verdict", async () => {
      const gate = createQaGate(() =>
        Promise.resolve({
          verdict: 'pass' as const,
          feedback: 'Looks good',
          issues: [],
        })
      );

      await expect(gate(makeResult('some worker output here'))).resolves.toBeUndefined();
    });

    it('returns undefined for non-success results without invoking the reviewer', async () => {
      let reviewCalls = 0;
      const gate = createQaGate(() => {
        reviewCalls += 1;
        return Promise.resolve({
          verdict: 'reject' as const,
          feedback: 'should not run',
          issues: [] as readonly string[],
        });
      });

      await expect(gate(makeResult('failed output', 'error'))).resolves.toBeUndefined();
      expect(reviewCalls).toBe(0);
    });
  });
});
