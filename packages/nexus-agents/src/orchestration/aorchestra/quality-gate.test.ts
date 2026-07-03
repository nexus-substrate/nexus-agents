/**
 * Tests for quality gates (#1502).
 *
 * @module orchestration/aorchestra/quality-gate.test
 */

import { describe, it, expect } from 'vitest';
import {
  outputLengthGate,
  nonEmptyGate,
  composeGates,
  applyQualityGate,
  createQaGate,
  DEFAULT_QUALITY_GATE,
  MIN_OUTPUT_LENGTH,
  MAX_OUTPUT_LENGTH,
} from './quality-gate.js';
import type { WorkerResult } from './worker-dispatcher.js';

const makeResult = (output: string, status: WorkerResult['status'] = 'success'): WorkerResult => ({
  role: 'code',
  subTask: 'implement feature',
  output,
  status,
  durationMs: 100,
});

describe('quality-gate', () => {
  describe('outputLengthGate', () => {
    it('passes output within bounds', () => {
      expect(outputLengthGate(makeResult('a'.repeat(50)))).toBeUndefined();
    });

    it('rejects output shorter than MIN_OUTPUT_LENGTH', () => {
      const result = outputLengthGate(makeResult('short'));
      expect(result).toContain('too short');
    });

    it('rejects output longer than MAX_OUTPUT_LENGTH', () => {
      const result = outputLengthGate(makeResult('x'.repeat(MAX_OUTPUT_LENGTH + 1)));
      expect(result).toContain('too long');
    });

    it('skips non-success results', () => {
      expect(outputLengthGate(makeResult('', 'error'))).toBeUndefined();
    });
  });

  describe('nonEmptyGate', () => {
    it('passes non-empty output', () => {
      expect(nonEmptyGate(makeResult('valid output'))).toBeUndefined();
    });

    it('rejects empty output', () => {
      expect(nonEmptyGate(makeResult(''))).toContain('empty');
    });

    it('rejects whitespace-only output', () => {
      expect(nonEmptyGate(makeResult('   \n\t  '))).toContain('empty');
    });

    it('skips non-success results', () => {
      expect(nonEmptyGate(makeResult('', 'error'))).toBeUndefined();
    });
  });

  describe('composeGates', () => {
    it('returns undefined when all gates pass', () => {
      const gate = composeGates(
        () => undefined,
        () => undefined
      );
      expect(gate(makeResult('valid'))).toBeUndefined();
    });

    it('returns first rejection reason', () => {
      const gate = composeGates(
        () => 'first fail',
        () => 'second fail'
      );
      expect(gate(makeResult('x'))).toBe('first fail');
    });

    it('stops at first rejection', () => {
      let secondCalled = false;
      const gate = composeGates(
        () => 'rejected',
        () => {
          secondCalled = true;
          return undefined;
        }
      );
      gate(makeResult('x'));
      expect(secondCalled).toBe(false);
    });
  });

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

  describe('DEFAULT_QUALITY_GATE', () => {
    it('passes valid output', () => {
      expect(DEFAULT_QUALITY_GATE(makeResult('a'.repeat(50)))).toBeUndefined();
    });

    it('rejects empty output', () => {
      expect(DEFAULT_QUALITY_GATE(makeResult(''))).toContain('empty');
    });

    it('rejects too-short output', () => {
      expect(DEFAULT_QUALITY_GATE(makeResult('short'))).toContain('too short');
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

  describe('constants', () => {
    it('exports MIN_OUTPUT_LENGTH', () => {
      expect(MIN_OUTPUT_LENGTH).toBe(10);
    });

    it('exports MAX_OUTPUT_LENGTH', () => {
      expect(MAX_OUTPUT_LENGTH).toBe(100_000);
    });
  });
});
