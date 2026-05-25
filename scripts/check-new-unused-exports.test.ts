/**
 * Tests for producer-without-consumer gate (#3024).
 */

import { describe, it, expect } from 'vitest';

import { classifyAddedFiles } from './check-new-unused-exports.js';

describe('classifyAddedFiles', () => {
  it('classifies a new source file as needing the consumer check', () => {
    const result = classifyAddedFiles(['packages/nexus-agents/src/foo/bar.ts']);
    expect(result.newSourceFiles).toEqual(['packages/nexus-agents/src/foo/bar.ts']);
    expect(result.skipped).toEqual([]);
  });

  it('skips test files', () => {
    const result = classifyAddedFiles([
      'packages/nexus-agents/src/foo/bar.test.ts',
      'packages/nexus-agents/src/foo/bar.spec.ts',
      'packages/nexus-agents/src/__tests__/baz.ts',
    ]);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped).toEqual([
      'packages/nexus-agents/src/foo/bar.test.ts',
      'packages/nexus-agents/src/foo/bar.spec.ts',
      'packages/nexus-agents/src/__tests__/baz.ts',
    ]);
  });

  it('skips barrel files (index.ts and src/exports/)', () => {
    const result = classifyAddedFiles([
      'packages/nexus-agents/src/foo/index.ts',
      'packages/nexus-agents/src/exports/agents.ts',
    ]);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped.length).toBe(2);
  });

  it('skips .d.ts declaration files', () => {
    const result = classifyAddedFiles(['packages/nexus-agents/src/foo/bar.d.ts']);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped).toEqual(['packages/nexus-agents/src/foo/bar.d.ts']);
  });

  it('ignores files outside packages/nexus-agents/src/', () => {
    const result = classifyAddedFiles([
      'scripts/foo.ts',
      'docs/bar.md',
      'packages/nexus-agents/test/integration.ts',
      '.changeset/foo.md',
    ]);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('handles a mixed batch correctly', () => {
    const result = classifyAddedFiles([
      'packages/nexus-agents/src/feature/handler.ts', // source — checkable
      'packages/nexus-agents/src/feature/handler.test.ts', // skipped (test)
      'packages/nexus-agents/src/feature/index.ts', // skipped (barrel)
      'scripts/migrate.ts', // ignored (outside src)
    ]);
    expect(result.newSourceFiles).toEqual(['packages/nexus-agents/src/feature/handler.ts']);
    expect(result.skipped).toEqual([
      'packages/nexus-agents/src/feature/handler.test.ts',
      'packages/nexus-agents/src/feature/index.ts',
    ]);
  });

  it('returns empty arrays for an empty input', () => {
    const result = classifyAddedFiles([]);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
