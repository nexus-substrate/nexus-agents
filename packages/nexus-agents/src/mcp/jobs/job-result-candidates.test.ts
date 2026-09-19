/**
 * Tests for candidate job-result resolution across data directories (#5472).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  candidateJobResultPaths,
  compareJobRecords,
  selectAuthoritativeJobRecord,
  syncAlternateCandidates,
  _setCandidatePathsResolverForTests,
} from './job-result-candidates.js';
import type { JobResult } from './job-result-store.js';
import { createLogger } from '../../core/index.js';

describe('job-result-candidates (#5472)', () => {
  describe('compareJobRecords and selectAuthoritativeJobRecord', () => {
    it('ranks terminal status over pending status', () => {
      const pendingRecord: JobResult = {
        v: 1,
        jobId: 'job-1',
        toolName: 'consensus_vote',
        status: 'pending',
        createdAt: '2026-09-04T19:28:32.000Z',
        lastProgressAt: '2026-09-04T19:35:00.000Z',
      };
      const completeRecord: JobResult = {
        v: 1,
        jobId: 'job-1',
        toolName: 'consensus_vote',
        status: 'complete',
        createdAt: '2026-09-04T19:28:32.000Z',
        completedAt: '2026-09-04T19:32:14.000Z',
        result: { verdict: 'approved' },
      };

      expect(compareJobRecords(completeRecord, pendingRecord)).toBeLessThan(0);
      expect(compareJobRecords(pendingRecord, completeRecord)).toBeGreaterThan(0);

      const winner = selectAuthoritativeJobRecord([pendingRecord, completeRecord]);
      expect(winner.status).toBe('complete');
      expect(winner.completedAt).toBe('2026-09-04T19:32:14.000Z');
      expect(winner.lastProgressAt).toBe('2026-09-04T19:35:00.000Z');
    });

    it('ranks cancelled status over complete status (cancellation preservation)', () => {
      const completeRecord: JobResult = {
        v: 1,
        jobId: 'job-2',
        toolName: 'orchestrate',
        status: 'complete',
        createdAt: '2026-09-04T19:00:00.000Z',
        completedAt: '2026-09-04T19:05:00.000Z',
      };
      const cancelledRecord: JobResult = {
        v: 1,
        jobId: 'job-2',
        toolName: 'orchestrate',
        status: 'cancelled',
        createdAt: '2026-09-04T19:00:00.000Z',
        completedAt: '2026-09-04T19:02:00.000Z',
        error: 'user cancelled',
      };

      const winner = selectAuthoritativeJobRecord([completeRecord, cancelledRecord]);
      expect(winner.status).toBe('cancelled');
    });

    it('prefers later completedAt between two terminal records', () => {
      const earlier: JobResult = {
        v: 1,
        jobId: 'job-3',
        toolName: 'orchestrate',
        status: 'failed',
        createdAt: '2026-09-04T19:00:00.000Z',
        completedAt: '2026-09-04T19:02:00.000Z',
        error: 'retryable failure',
      };
      const later: JobResult = {
        v: 1,
        jobId: 'job-3',
        toolName: 'orchestrate',
        status: 'complete',
        createdAt: '2026-09-04T19:00:00.000Z',
        completedAt: '2026-09-04T19:06:00.000Z',
        result: { ok: true },
      };

      const winner = selectAuthoritativeJobRecord([earlier, later]);
      expect(winner.status).toBe('complete');
      expect(winner.completedAt).toBe('2026-09-04T19:06:00.000Z');
    });

    it('prefers later lastProgressAt between two pending records', () => {
      const earlierProgress: JobResult = {
        v: 1,
        jobId: 'job-4',
        toolName: 'orchestrate',
        status: 'pending',
        createdAt: '2026-09-04T19:00:00.000Z',
        lastProgressAt: '2026-09-04T19:01:00.000Z',
      };
      const laterProgress: JobResult = {
        v: 1,
        jobId: 'job-4',
        toolName: 'orchestrate',
        status: 'pending',
        createdAt: '2026-09-04T19:00:00.000Z',
        lastProgressAt: '2026-09-04T19:04:00.000Z',
      };

      const winner = selectAuthoritativeJobRecord([earlierProgress, laterProgress]);
      expect(winner.lastProgressAt).toBe('2026-09-04T19:04:00.000Z');
    });
  });

  describe('candidateJobResultPaths', () => {
    const originalDataDir = process.env['NEXUS_DATA_DIR'];

    afterEach(() => {
      if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
      else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    });

    it('returns both repo-local and shared paths when repo root is active', () => {
      delete process.env['NEXUS_DATA_DIR'];
      const repoDir = '/workspace/repo/.nexus-agents/jobs/result-test-job-paths.json';
      const sharedDir = '/home/user/.nexus-agents/jobs/result-test-job-paths.json';
      const paths = candidateJobResultPaths(
        'test-job-paths',
        () => repoDir,
        () => sharedDir,
        () => null
      );
      expect(paths).toEqual([repoDir, sharedDir]);
    });

    it('returns single path when NEXUS_DATA_DIR is explicitly set', () => {
      const explicitDir = '/custom/data/dir';
      process.env['NEXUS_DATA_DIR'] = explicitDir;
      const paths = candidateJobResultPaths('test-job-explicit');
      expect(paths).toEqual([join(explicitDir, 'jobs', 'result-test-job-explicit.json')]);
    });

    it('includes cwdRepo when different from primary and shared', () => {
      delete process.env['NEXUS_DATA_DIR'];
      const repoDir = '/workspace/repo-a/.nexus-agents/jobs/result-test-job-cwd.json';
      const sharedDir = '/home/user/.nexus-agents/jobs/result-test-job-cwd.json';
      const cwdRepo = '/workspace/repo-b';
      const paths = candidateJobResultPaths(
        'test-job-cwd',
        () => repoDir,
        () => sharedDir,
        () => cwdRepo
      );
      expect(paths).toEqual([
        repoDir,
        sharedDir,
        join(cwdRepo, '.nexus-agents', 'jobs', 'result-test-job-cwd.json'),
      ]);
    });
  });

  describe('syncAlternateCandidates', () => {
    it('syncs record to existing alternate candidate paths', () => {
      const primaryDir = mkdtempSync(join(tmpdir(), 'nexus-prim-'));
      const altDir = mkdtempSync(join(tmpdir(), 'nexus-alt-'));
      const primaryPath = join(primaryDir, 'result-sync-1.json');
      const altPath = join(altDir, 'result-sync-1.json');

      const initialPending: JobResult = {
        v: 1,
        jobId: 'sync-1',
        toolName: 'orchestrate',
        status: 'pending',
        createdAt: '2026-09-04T19:00:00.000Z',
      };
      const persisted: Record<string, string> = {};
      const fakePersist = (p: string, rec: JobResult): void => {
        persisted[p] = rec.status;
      };

      const logger = createLogger({ component: 'test' });
      _setCandidatePathsResolverForTests(() => [primaryPath, altPath]);

      try {
        // If altPath does not exist on disk, it is NOT synced
        syncAlternateCandidates(
          'sync-1',
          primaryPath,
          { ...initialPending, status: 'complete', completedAt: '2026-09-04T19:05:00.000Z' },
          logger,
          fakePersist
        );
        expect(persisted[altPath]).toBeUndefined();

        // Create altPath on disk — now it exists and IS synced
        writeFileSync(altPath, JSON.stringify(initialPending, null, 2));
        syncAlternateCandidates(
          'sync-1',
          primaryPath,
          { ...initialPending, status: 'complete', completedAt: '2026-09-04T19:05:00.000Z' },
          logger,
          fakePersist
        );
        expect(persisted[altPath]).toBe('complete');
      } finally {
        _setCandidatePathsResolverForTests(undefined);
        rmSync(primaryDir, { recursive: true, force: true });
        rmSync(altDir, { recursive: true, force: true });
      }
    });
  });
});
