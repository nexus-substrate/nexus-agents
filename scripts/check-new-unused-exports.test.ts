/**
 * Tests for producer-without-consumer gate (#3024).
 */

import { describe, it, expect } from 'vitest';

import {
  classifyAddedFiles,
  importSpecifierPatterns,
  isTestSupportFile,
} from './check-new-unused-exports.js';

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

describe('isTestSupportFile (#4412)', () => {
  it('treats a helper under src/testing/ as test-support', () => {
    // Its consumers are tests by design. Requiring a *production* consumer
    // would leave "mislabel it with the no-consumer-yet marker" as the only
    // way to add a test helper — a marker promising a consumer never coming.
    expect(isTestSupportFile('packages/nexus-agents/src/testing/non-repo-temp-dir.ts')).toBe(true);
  });

  it('treats a nested helper under src/testing/ as test-support', () => {
    expect(isTestSupportFile('packages/nexus-agents/src/testing/adapters/fake-cli.ts')).toBe(true);
  });

  it('does NOT treat ordinary production code as test-support', () => {
    // The narrowness is the point: this must not become a blanket exemption.
    expect(isTestSupportFile('packages/nexus-agents/src/config/nexus-tmp-dir.ts')).toBe(false);
  });

  it('does NOT match a production file merely named like testing', () => {
    expect(isTestSupportFile('packages/nexus-agents/src/cli/testing-command.ts')).toBe(false);
  });
});

describe('importSpecifierPatterns — a dynamic import is a consumer', () => {
  const matches = (file: string, source: string): boolean =>
    importSpecifierPatterns(file).some((p) => p.test(source));

  it('matches a static import', () => {
    expect(matches('doctor-live.ts', "import { run } from './cli/doctor-live.js';")).toBe(true);
  });

  it('matches an awaited dynamic import', () => {
    // The shape this gate missed. `await import(...)` is how opt-in CLI
    // subcommands are loaded here (doctor-deep, doctor-live), so a from-only
    // pattern reported a genuinely-consumed module as dead — and a gate that
    // fires on the repo's own convention trains people to use the opt-out.
    expect(matches('doctor-live.ts', "const { run } = await import('./cli/doctor-live.js');")).toBe(
      true
    );
  });

  it('matches a bare dynamic import with no await', () => {
    expect(matches('doctor-live.ts', "void import('./cli/doctor-live.js');")).toBe(true);
  });

  it('matches a dynamic import split across lines', () => {
    expect(matches('doctor-live.ts', "await import(\n  './cli/doctor-live.js'\n)")).toBe(true);
  });

  it('matches a require for CJS interop', () => {
    expect(matches('doctor-live.ts', "const m = require('./cli/doctor-live.js');")).toBe(true);
  });

  it('does not match a different file with a similar name', () => {
    expect(matches('doctor-live.ts', "import x from './cli/doctor-deep.js';")).toBe(false);
  });

  it('does not match the bare name outside an import position', () => {
    // A mention in a comment or a string is not a consumer.
    expect(matches('doctor-live.ts', '// see cli/doctor-live.js for details')).toBe(false);
  });
});
