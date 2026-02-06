/**
 * Tests for Self-Development Deps Factory
 *
 * @module workflows/self-development/deps-factory.test
 */

import { describe, it, expect, vi } from 'vitest';
import { createSelfDevDeps, hasRealExecution } from './deps-factory.js';
import type { SelfDevDepsResult } from './deps-factory.js';

// ============================================================================
// createSelfDevDeps — no adapter
// ============================================================================

describe('createSelfDevDeps', () => {
  it('creates deps without model adapter', () => {
    const result = createSelfDevDeps();

    expect(result.deps).toBeDefined();
    expect(result.status.modelAdapter).toBe(false);
    expect(result.status.trinity).toBe(false);
    expect(result.status.reflexion).toBe(false);
    expect(result.status.consensus).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('No model adapter');
  });

  it('creates deps with workingDir', () => {
    const result = createSelfDevDeps({ workingDir: '/tmp/test' });

    expect(result.status.gitClient).toBe(true);
  });

  it('creates deps with repository', () => {
    const result = createSelfDevDeps({ repository: 'owner/repo' });

    expect(result.status.githubClient).toBe(true);
  });

  it('warns about missing workingDir', () => {
    const result = createSelfDevDeps();

    expect(result.warnings).toContainEqual(expect.stringContaining('workingDir'));
  });

  it('warns about missing repository', () => {
    const result = createSelfDevDeps();

    expect(result.warnings).toContainEqual(expect.stringContaining('repository'));
  });

  it('throws in failFast mode without adapter', () => {
    expect(() => createSelfDevDeps({ failFast: true })).toThrow('No model adapter');
  });

  it('creates deps with model adapter', () => {
    const mockAdapter = {
      providerId: 'test',
      complete: vi.fn(),
    } as never;

    const result = createSelfDevDeps({ modelAdapter: mockAdapter });

    expect(result.status.modelAdapter).toBe(true);
    expect(result.status.trinity).toBe(true);
    expect(result.status.reflexion).toBe(true);
    expect(result.status.consensus).toBe(true);
    expect(result.status.selfDebug).toBe(true);
    expect(result.status.selfRefine).toBe(true);
  });

  it('includes auditTrail and notifications in all cases', () => {
    const result = createSelfDevDeps();

    expect(result.deps.auditTrail).toBeDefined();
    expect(result.deps.notifications).toBeDefined();
  });

  it('uses custom logger', () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    createSelfDevDeps({ logger });

    expect((logger as unknown as { info: ReturnType<typeof vi.fn> }).info).toHaveBeenCalledWith(
      'Self-development dependencies created',
      expect.any(Object)
    );
  });
});

// ============================================================================
// hasRealExecution
// ============================================================================

describe('hasRealExecution', () => {
  it('returns true when all critical protocols available', () => {
    const status: SelfDevDepsResult['status'] = {
      modelAdapter: true,
      trinity: true,
      reflexion: true,
      consensus: true,
      selfDebug: true,
      selfRefine: true,
      gitClient: true,
      githubClient: true,
    };

    expect(hasRealExecution(status)).toBe(true);
  });

  it('returns false when trinity missing', () => {
    const status: SelfDevDepsResult['status'] = {
      modelAdapter: true,
      trinity: false,
      reflexion: true,
      consensus: true,
      selfDebug: true,
      selfRefine: true,
      gitClient: true,
      githubClient: true,
    };

    expect(hasRealExecution(status)).toBe(false);
  });

  it('returns false when reflexion missing', () => {
    const status: SelfDevDepsResult['status'] = {
      modelAdapter: true,
      trinity: true,
      reflexion: false,
      consensus: true,
      selfDebug: true,
      selfRefine: true,
      gitClient: true,
      githubClient: true,
    };

    expect(hasRealExecution(status)).toBe(false);
  });

  it('returns false when consensus missing', () => {
    const status: SelfDevDepsResult['status'] = {
      modelAdapter: true,
      trinity: true,
      reflexion: true,
      consensus: false,
      selfDebug: true,
      selfRefine: true,
      gitClient: true,
      githubClient: true,
    };

    expect(hasRealExecution(status)).toBe(false);
  });

  it('does not require gitClient or githubClient', () => {
    const status: SelfDevDepsResult['status'] = {
      modelAdapter: true,
      trinity: true,
      reflexion: true,
      consensus: true,
      selfDebug: true,
      selfRefine: true,
      gitClient: false,
      githubClient: false,
    };

    expect(hasRealExecution(status)).toBe(true);
  });
});
