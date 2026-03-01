/**
 * Tests for ConflictDetector — detects overlapping file references in worker results.
 *
 * Detection-only — flags conflicts for human escalation, does not auto-resolve.
 *
 * @module orchestration/aorchestra/conflict-detector.test
 * (Source: Issue #1302, Epic #1299)
 */

import { describe, it, expect } from 'vitest';
import { detectConflicts } from './conflict-detector.js';
import type { WorkerResult } from './worker-dispatcher.js';

// ============================================================================
// Helpers
// ============================================================================

function makeResult(role: string, output: string): WorkerResult {
  return {
    role,
    subTask: `Task for ${role}`,
    output,
    status: 'success',
    durationMs: 100,
  };
}

// ============================================================================
// detectConflicts
// ============================================================================

describe('detectConflicts', () => {
  it('returns empty array when no file references overlap', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Modified src/auth.ts to add login handler'),
      makeResult('testing', 'Created tests in src/auth.test.ts'),
    ];
    const conflicts = detectConflicts(results);
    expect(conflicts).toEqual([]);
  });

  it('detects overlapping file references between workers', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Modified src/auth.ts with new handler'),
      makeResult('security', 'Modified src/auth.ts to add rate limiting'),
    ];
    const conflicts = detectConflicts(results);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.filePath).toBe('src/auth.ts');
    expect(conflicts[0]?.workers).toContain('code');
    expect(conflicts[0]?.workers).toContain('security');
  });

  it('detects multiple overlapping files', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Changed src/auth.ts and src/config.ts'),
      makeResult('security', 'Updated src/auth.ts for validation'),
      makeResult('devops', 'Modified src/config.ts for env vars'),
    ];
    const conflicts = detectConflicts(results);
    expect(conflicts).toHaveLength(2);
    const paths = conflicts.map((c) => c.filePath).sort();
    expect(paths).toEqual(['src/auth.ts', 'src/config.ts']);
  });

  it('extracts file paths from various patterns', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Edit `src/handler.ts` to add endpoint'),
      makeResult('testing', 'Update file src/handler.ts with test hooks'),
    ];
    const conflicts = detectConflicts(results);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.filePath).toBe('src/handler.ts');
  });

  it('ignores error results', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Modified src/auth.ts'),
      { ...makeResult('security', 'Modified src/auth.ts'), status: 'error', output: '' },
    ];
    const conflicts = detectConflicts(results);
    expect(conflicts).toEqual([]);
  });

  it('returns empty for empty results', () => {
    expect(detectConflicts([])).toEqual([]);
  });

  it('handles results with no file references', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Implemented the login feature'),
      makeResult('testing', 'Added comprehensive test coverage'),
    ];
    const conflicts = detectConflicts(results);
    expect(conflicts).toEqual([]);
  });

  it('extracts .tsx, .jsx, .json, .yaml file paths', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Updated src/App.tsx component'),
      makeResult('ux', 'Modified src/App.tsx for accessibility'),
    ];
    const conflicts = detectConflicts(results);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.filePath).toBe('src/App.tsx');
  });

  it('deduplicates workers per conflict', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Changed src/auth.ts in two places in src/auth.ts'),
      makeResult('security', 'Reviewed src/auth.ts for issues'),
    ];
    const conflicts = detectConflicts(results);
    expect(conflicts).toHaveLength(1);
    // 'code' should only appear once even though file mentioned twice
    const codeCount = conflicts[0]?.workers.filter((w) => w === 'code').length;
    expect(codeCount).toBe(1);
  });
});
