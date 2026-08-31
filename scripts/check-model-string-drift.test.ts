/**
 * Unit tests for the model-string drift fitness-guard (#2199 Child 2).
 *
 * Tests the pure predicates first (cheap), then a single integration test
 * that runs ts-morph on in-memory fixtures.
 *
 * @module scripts/check-model-string-drift.test
 */

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';

import {
  isViolatingLiteral,
  shouldScanFile,
  collectViolations,
  scannedFileCount,
  STABLE_ALIASES,
} from './check-model-string-drift.js';
import { isAllowed, type AllowlistEntry } from './model-string-drift-allowlist.js';

describe('isViolatingLiteral', () => {
  it('flags full Claude version strings', () => {
    expect(isViolatingLiteral('claude-opus-4-20250514')).toBe(true);
    expect(isViolatingLiteral('claude-sonnet-4-6')).toBe(true);
    expect(isViolatingLiteral('claude-haiku-4-5-20251001')).toBe(true);
  });

  it('flags Gemini version strings', () => {
    expect(isViolatingLiteral('gemini-3.1-pro-preview')).toBe(true);
    expect(isViolatingLiteral('gemini-2.5-flash')).toBe(true);
    expect(isViolatingLiteral('gemini-3-flash-preview')).toBe(true);
  });

  it('flags OpenAI / GPT version strings', () => {
    expect(isViolatingLiteral('gpt-5.2-codex')).toBe(true);
    expect(isViolatingLiteral('gpt-4o-2024-11-20')).toBe(true);
    expect(isViolatingLiteral('gpt-3.5-turbo-0125')).toBe(true);
  });

  it('flags provider-prefixed version strings', () => {
    expect(isViolatingLiteral('anthropic/claude-sonnet-4-6')).toBe(true);
    expect(isViolatingLiteral('openrouter/qwen-coder-480b-a35b:free')).toBe(false); // not in scope
  });

  it('passes stable aliases through unchanged', () => {
    for (const alias of STABLE_ALIASES) {
      expect(isViolatingLiteral(alias)).toBe(false);
    }
  });

  it('passes through unrelated strings', () => {
    expect(isViolatingLiteral('foo')).toBe(false);
    expect(isViolatingLiteral('hello world')).toBe(false);
    expect(isViolatingLiteral('process.env.HOME')).toBe(false);
    expect(isViolatingLiteral('claude-foo-bar')).toBe(false); // no digits
  });
});

describe('shouldScanFile', () => {
  it('skips files in src/config/', () => {
    expect(shouldScanFile('/abs/packages/nexus-agents/src/config/model-capabilities.ts')).toBe(
      false
    );
  });

  it('skips test files', () => {
    expect(shouldScanFile('/abs/packages/nexus-agents/src/adapters/claude.test.ts')).toBe(false);
  });

  it('scans regular source files', () => {
    expect(shouldScanFile('/abs/packages/nexus-agents/src/adapters/claude-adapter.ts')).toBe(true);
    expect(shouldScanFile('/abs/packages/nexus-agents/src/cli/setup-custom-api.ts')).toBe(true);
  });
});

describe('isAllowed', () => {
  const allowlist: readonly AllowlistEntry[] = [
    { file: 'packages/foo/bar.ts', reason: 'r', trackingIssue: 100 },
    { file: 'packages/foo/baz.ts', literal: 'specific-thing', reason: 'r', trackingIssue: 101 },
  ];

  it('grandfathers all literals when entry omits literal', () => {
    expect(isAllowed('packages/foo/bar.ts', 'anything', allowlist)).toBe(true);
    expect(isAllowed('packages/foo/bar.ts', 'something-else', allowlist)).toBe(true);
  });

  it('grandfathers only the named literal when entry specifies one', () => {
    expect(isAllowed('packages/foo/baz.ts', 'specific-thing', allowlist)).toBe(true);
    expect(isAllowed('packages/foo/baz.ts', 'other-thing', allowlist)).toBe(false);
  });

  it('does not grandfather files that are not on the allowlist', () => {
    expect(isAllowed('packages/foo/qux.ts', 'anything', allowlist)).toBe(false);
  });

  it('normalizes Windows-style separators', () => {
    expect(isAllowed('packages\\foo\\bar.ts', 'anything', allowlist)).toBe(true);
  });
});

describe('collectViolations (integration)', () => {
  function projectWith(files: Record<string, string>): Project {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipLoadingLibFiles: true,
    });
    for (const [path, src] of Object.entries(files)) {
      project.createSourceFile(path, src);
    }
    return project;
  }

  it('returns no violations on a clean file', () => {
    const project = projectWith({
      'packages/nexus-agents/src/foo.ts': `export const x = 'hello';`,
    });
    expect(collectViolations(project)).toHaveLength(0);
  });

  it('flags a hardcoded model-version string in source', () => {
    const project = projectWith({
      'packages/nexus-agents/src/adapters/foo-adapter.ts': `
        export const VERSION = 'claude-opus-4-20250514';
      `,
    });
    const violations = collectViolations(project);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.literal).toBe('claude-opus-4-20250514');
  });

  it('does NOT flag the same string in a JSDoc comment', () => {
    const project = projectWith({
      'packages/nexus-agents/src/adapters/foo-adapter.ts': `
        /**
         * Example: claude-opus-4-20250514 is the legacy id.
         * @example const x = 'claude-opus-4-20250514';
         */
        export const x = 1;
      `,
    });
    expect(collectViolations(project)).toHaveLength(0);
  });

  it('does NOT flag the same string in a // line comment', () => {
    const project = projectWith({
      'packages/nexus-agents/src/adapters/foo-adapter.ts': `
        // see claude-opus-4-20250514 for context
        export const x = 1;
      `,
    });
    expect(collectViolations(project)).toHaveLength(0);
  });

  it('does NOT flag stable aliases', () => {
    const project = projectWith({
      'packages/nexus-agents/src/adapters/foo-adapter.ts': `
        export const A = 'claude-sonnet-4';
        export const B = 'opus';
      `,
    });
    expect(collectViolations(project)).toHaveLength(0);
  });

  it('does NOT flag config files', () => {
    const project = projectWith({
      'packages/nexus-agents/src/config/foo.ts': `
        export const X = 'claude-opus-4-20250514';
      `,
    });
    expect(collectViolations(project)).toHaveLength(0);
  });

  it('does NOT flag test files', () => {
    const project = projectWith({
      'packages/nexus-agents/src/adapters/foo.test.ts': `
        expect(x).toBe('claude-opus-4-20250514');
      `,
    });
    expect(collectViolations(project)).toHaveLength(0);
  });
});

describe('scannedFileCount (#5261-class)', () => {
  /**
   * `main` reported success on `violations.length === 0` over whatever
   * `addSourceFilesAtPaths` happened to match. ts-morph returns an empty set
   * for a glob that matches nothing — it does not throw — so a package rename
   * or an `src/` move would have printed
   *
   *   ✓ No new model-version drift detected. Source root: <path>
   *     18 grandfathered site(s) in allowlist ...
   *
   * and exited 0 having parsed no files at all, from a required CI job.
   *
   * The allowlist line makes it worse rather than better: `allowedCount` is
   * `ALLOWLIST.length`, a static constant, so the operator is shown a number
   * that reads as coverage but is entirely independent of what was scanned.
   */
  it('returns zero for a project with no source files', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    expect(scannedFileCount(project)).toBe(0);
  });

  it('counts the files the scan would actually inspect', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/src/a.ts', 'export const a = 1;');
    project.createSourceFile('/src/b.ts', 'export const b = 2;');
    expect(scannedFileCount(project)).toBe(2);
  });

  it('excludes files the scan skips, so the count never overstates coverage', () => {
    // Shares `shouldScanFile` with `collectViolations` rather than
    // re-implementing the filter: a count derived from a different rule than
    // the scan would certify coverage the scan does not have.
    const project = new Project({ useInMemoryFileSystem: true });
    const scanned = project.createSourceFile('/src/real.ts', 'export const a = 1;');
    const skipped = project.createSourceFile('/src/real.test.ts', 'export const b = 2;');

    expect(shouldScanFile(scanned.getFilePath())).toBe(true);
    expect(shouldScanFile(skipped.getFilePath())).toBe(false);
    expect(scannedFileCount(project)).toBe(1);
  });
});
