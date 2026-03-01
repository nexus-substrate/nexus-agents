/**
 * E2E integration tests for trigger table routing and conflict detection.
 *
 * Verifies the trigger table recommends correct experts for file patterns,
 * and conflict detector identifies overlapping file references from workers.
 */

import { describe, it, expect } from 'vitest';
import { matchTriggers, DEFAULT_TRIGGER_TABLE } from './trigger-table.js';
import { detectConflicts, type WorkerConflict } from './conflict-detector.js';
import type { WorkerResult } from './worker-dispatcher.js';

describe('Trigger Table E2E — real file pattern scenarios', () => {
  it('routes a full-stack PR to multiple experts', () => {
    const changedFiles = [
      'src/auth/login.ts',
      'src/auth/login.test.ts',
      'docs/api/auth.md',
      'Dockerfile',
      '.github/workflows/ci.yml',
    ];

    const experts = matchTriggers(changedFiles);
    expect(experts).toContain('security'); // auth/
    expect(experts).toContain('testing'); // .test.
    expect(experts).toContain('documentation'); // docs/, .md
    expect(experts).toContain('devops'); // Dockerfile, .github/workflows
  });

  it('routes infrastructure changes correctly', () => {
    const changedFiles = [
      'terraform/modules/vpc.tf',
      'ansible/playbooks/deploy.yml',
      'adr/0042-vpc-topology.md',
    ];

    const experts = matchTriggers(changedFiles);
    expect(experts).toContain('infrastructure'); // terraform/, .tf
    expect(experts).toContain('architecture'); // adr/
    expect(experts).toContain('documentation'); // .md
    expect(experts).toContain('devops'); // .yml
  });

  it('returns empty for files with no matching patterns', () => {
    const changedFiles = ['src/core/utils.ts', 'src/config/defaults.ts'];

    const experts = matchTriggers(changedFiles);
    // .ts files without test/security/etc patterns don't trigger
    expect(experts).toHaveLength(0);
  });

  it('deduplicates roles from multiple matching files', () => {
    const changedFiles = ['src/foo.test.ts', 'src/bar.test.ts', 'src/baz.spec.ts'];

    const experts = matchTriggers(changedFiles);
    expect(experts).toEqual(['testing']);
  });

  it('is case-insensitive for file matching', () => {
    const changedFiles = ['DOCKERFILE', 'Docs/README.MD'];
    const experts = matchTriggers(changedFiles);
    expect(experts).toContain('devops');
    expect(experts).toContain('documentation');
  });

  it('has at least 25 default trigger rules', () => {
    expect(DEFAULT_TRIGGER_TABLE.length).toBeGreaterThanOrEqual(25);
  });
});

describe('Conflict Detection E2E — realistic worker output scenarios', () => {
  function makeResult(role: string, output: string): WorkerResult {
    return { role, subTask: `Task for ${role}`, output, status: 'success', durationMs: 100 };
  }

  it('detects conflict when two workers reference the same file', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'I modified `src/auth/login.ts` to add the new login flow.'),
      makeResult('security', 'Updated `src/auth/login.ts` with input validation.'),
    ];

    const conflicts = detectConflicts(results);
    expect(conflicts.length).toBeGreaterThan(0);

    const loginConflict = conflicts.find((c: WorkerConflict) => c.filePath.includes('auth/login'));
    expect(loginConflict).toBeDefined();
    expect(loginConflict?.workers).toContain('code');
    expect(loginConflict?.workers).toContain('security');
  });

  it('reports no conflicts when workers touch different files', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Created `src/rate-limiter.ts` with the core implementation.'),
      makeResult('testing', 'Added tests in `src/rate-limiter.test.ts`.'),
      makeResult('documentation', 'Updated `docs/api/rate-limiting.md`.'),
    ];

    const conflicts = detectConflicts(results);
    expect(conflicts).toHaveLength(0);
  });

  it('skips error results in conflict detection', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'Modified `src/shared.ts` with feature code.'),
      {
        role: 'security',
        subTask: 'Review',
        output: '',
        status: 'error',
        durationMs: 50,
        error: 'timeout',
      },
    ];

    const conflicts = detectConflicts(results);
    expect(conflicts).toHaveLength(0);
  });

  it('detects multiple conflicts across several files', () => {
    const results: WorkerResult[] = [
      makeResult(
        'code',
        'Changed `src/api/routes.ts` and `src/api/middleware.ts` for the new endpoint.'
      ),
      makeResult(
        'security',
        'Applied security hardening to `src/api/routes.ts` and `src/api/auth.ts`.'
      ),
      makeResult('devops', 'Updated `src/api/middleware.ts` with logging middleware.'),
    ];

    const conflicts = detectConflicts(results);
    // routes.ts: code + security, middleware.ts: code + devops
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
  });
});
