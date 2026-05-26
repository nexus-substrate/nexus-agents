/**
 * Tests for job-idempotency (#3042 Stage 1c / epic #2631).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveIdempotency, registerIdempotentJob, computeInputsHash } from './job-idempotency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

describe('job-idempotency', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-idemp-test-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('computeInputsHash', () => {
    it('produces identical hashes for objects with reordered keys', () => {
      expect(computeInputsHash({ a: 1, b: 2 })).toBe(computeInputsHash({ b: 2, a: 1 }));
    });

    it('produces different hashes for different values', () => {
      expect(computeInputsHash({ a: 1 })).not.toBe(computeInputsHash({ a: 2 }));
    });

    it('handles nested objects deterministically', () => {
      const a = { outer: { x: 1, y: 2 }, list: [3, 1, 2] };
      const b = { list: [3, 1, 2], outer: { y: 2, x: 1 } };
      expect(computeInputsHash(a)).toBe(computeInputsHash(b));
    });

    it('treats array order as significant', () => {
      expect(computeInputsHash([1, 2])).not.toBe(computeInputsHash([2, 1]));
    });

    it('drops undefined values consistently with JSON', () => {
      expect(computeInputsHash({ a: 1, b: undefined })).toBe(computeInputsHash({ a: 1 }));
    });

    it('produces hex strings of expected length', () => {
      expect(computeInputsHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('resolveIdempotency — no key', () => {
    it('returns fresh with randomFallback jobId when key is undefined', () => {
      const fallback = (): string => 'random-uuid-1';
      const r = resolveIdempotency('orchestrate', undefined, { task: 'x' }, fallback);
      expect(r).toEqual({ kind: 'fresh', jobId: 'random-uuid-1' });
    });

    it('returns fresh with randomFallback jobId when key is empty string', () => {
      const fallback = (): string => 'random-uuid-2';
      const r = resolveIdempotency('orchestrate', '', { task: 'x' }, fallback);
      expect(r).toEqual({ kind: 'fresh', jobId: 'random-uuid-2' });
    });
  });

  describe('resolveIdempotency — with key, no prior entry', () => {
    it('returns fresh with deterministic jobId derived from (tool, key, inputs)', () => {
      const r1 = resolveIdempotency('orchestrate', 'my-key', { task: 'x' });
      const r2 = resolveIdempotency('orchestrate', 'my-key', { task: 'x' });
      expect(r1.kind).toBe('fresh');
      expect(r2.kind).toBe('fresh');
      if (r1.kind === 'fresh' && r2.kind === 'fresh') expect(r1.jobId).toBe(r2.jobId);
    });

    it('derives different jobIds for different tools with same key+inputs', () => {
      const r1 = resolveIdempotency('orchestrate', 'k', { task: 'x' });
      const r2 = resolveIdempotency('run_workflow', 'k', { task: 'x' });
      expect(r1.kind).toBe('fresh');
      expect(r2.kind).toBe('fresh');
      if (r1.kind === 'fresh' && r2.kind === 'fresh') expect(r1.jobId).not.toBe(r2.jobId);
    });

    it('prefixes jobId with tool name for ergonomics', () => {
      const r = resolveIdempotency('orchestrate', 'k', { task: 'x' });
      expect(r.kind).toBe('fresh');
      if (r.kind === 'fresh') expect(r.jobId).toMatch(/^job-orchestrate-[0-9a-f]{16}$/);
    });
  });

  describe('resolveIdempotency — replay (same key, same inputs)', () => {
    it('returns replay with the existing jobId after register', () => {
      const tool = 'orchestrate';
      const key = 'replay-key';
      const inputs = { task: 'do thing' };
      const first = resolveIdempotency(tool, key, inputs);
      if (first.kind !== 'fresh') throw new Error('expected fresh on first call');
      registerIdempotentJob({ tool, idempotencyKey: key, inputs, jobId: first.jobId });

      const second = resolveIdempotency(tool, key, inputs);
      expect(second.kind).toBe('replay');
      if (second.kind === 'replay') {
        expect(second.jobId).toBe(first.jobId);
        expect(second.entry.tool).toBe(tool);
        expect(second.entry.key).toBe(key);
      }
    });

    it('replay survives the inputs being passed with reordered keys', () => {
      const tool = 'orchestrate';
      const key = 'k';
      const first = resolveIdempotency(tool, key, { a: 1, b: 2 });
      if (first.kind !== 'fresh') throw new Error('expected fresh');
      registerIdempotentJob({
        tool,
        idempotencyKey: key,
        inputs: { a: 1, b: 2 },
        jobId: first.jobId,
      });

      const second = resolveIdempotency(tool, key, { b: 2, a: 1 });
      expect(second.kind).toBe('replay');
      if (second.kind === 'replay') expect(second.jobId).toBe(first.jobId);
    });
  });

  describe('resolveIdempotency — collision (same key, different inputs)', () => {
    it('returns collision with both hashes when inputs differ', () => {
      const tool = 'orchestrate';
      const key = 'collide-key';
      const inputsA = { task: 'a' };
      const inputsB = { task: 'b' };

      const first = resolveIdempotency(tool, key, inputsA);
      if (first.kind !== 'fresh') throw new Error('expected fresh');
      registerIdempotentJob({ tool, idempotencyKey: key, inputs: inputsA, jobId: first.jobId });

      const second = resolveIdempotency(tool, key, inputsB);
      expect(second.kind).toBe('collision');
      if (second.kind === 'collision') {
        expect(second.existingJobId).toBe(first.jobId);
        expect(second.existingInputsHash).toBe(computeInputsHash(inputsA));
        expect(second.incomingInputsHash).toBe(computeInputsHash(inputsB));
        expect(second.existingInputsHash).not.toBe(second.incomingInputsHash);
      }
    });
  });

  describe('registerIdempotentJob', () => {
    it('is idempotent — second register call with same key is a no-op', () => {
      const tool = 'orchestrate';
      const key = 'k';
      const inputs = { task: 'x' };
      const r1 = resolveIdempotency(tool, key, inputs);
      if (r1.kind !== 'fresh') throw new Error('expected fresh');
      registerIdempotentJob({ tool, idempotencyKey: key, inputs, jobId: r1.jobId });
      // Second register with the SAME jobId — must not corrupt the index.
      registerIdempotentJob({ tool, idempotencyKey: key, inputs, jobId: r1.jobId });

      const r2 = resolveIdempotency(tool, key, inputs);
      expect(r2.kind).toBe('replay');
      if (r2.kind === 'replay') expect(r2.jobId).toBe(r1.jobId);
    });

    it('does not overwrite an existing entry with a different jobId', () => {
      // Race: caller A wrote the entry first, caller B's "fresh" outcome
      // raced past the read but lost the write. We MUST keep A's entry
      // so subsequent replays converge on A's jobId.
      const tool = 'orchestrate';
      const key = 'k';
      const inputs = { task: 'x' };
      registerIdempotentJob({ tool, idempotencyKey: key, inputs, jobId: 'job-from-A' });
      registerIdempotentJob({ tool, idempotencyKey: key, inputs, jobId: 'job-from-B' });

      const r = resolveIdempotency(tool, key, inputs);
      expect(r.kind).toBe('replay');
      if (r.kind === 'replay') expect(r.jobId).toBe('job-from-A');
    });
  });
});
