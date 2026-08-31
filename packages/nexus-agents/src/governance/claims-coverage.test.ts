/**
 * nexus-agents/governance - Claims coverage (anti-gaming) tests.
 *
 * Proves the reverse coverage check (#3880): a doc that makes a quantified
 * capability claim with NO covering registry entry FAILS the gate, while the
 * current honest state — every sentinel claim backed by a `subjectContains`
 * entry — passes.
 *
 * @module governance/claims-coverage.test
 * (Source: Issue #3880)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseClaimsRegistry, type ClaimsRegistry } from './claims-registry.js';
import {
  checkCoverage,
  findClaimMatches,
  CLAIM_PATTERNS,
  SCANNED_DOCS,
  type DocReader,
} from './claims-coverage.js';

const REPO_ROOT = join(import.meta.dirname, '../../../..');
const REGISTRY_PATH = join(REPO_ROOT, 'governance/claims-registry.yaml');

/** Build an in-memory reader from a doc-name -> content map (identity resolve). */
function fakeReader(files: Record<string, string>): {
  resolve: (doc: string) => string;
  fs: DocReader;
} {
  return {
    resolve: (doc): string => doc,
    fs: {
      exists: (p): boolean => p in files,
      read: (p): string => files[p] ?? '',
    },
  };
}

/** A minimal registry covering one sentinel claim in README via subjectContains. */
function registryCovering(subjectContains: string, subject = 'README.md'): ClaimsRegistry {
  return {
    version: 1,
    claims: [
      {
        id: 'sample',
        claim: 'A sample claim under 25 words.',
        subject,
        status: 'verified',
        evidenceType: 'source',
        verification: { method: 'file-contains', path: 'src/x.ts', expected: 'X', subjectContains },
        lastVerified: '2026-06-16',
      },
    ],
  };
}

describe('findClaimMatches', () => {
  it('matches the sentinel quantified-capability patterns', () => {
    const found = findClaimMatches('We expose 46 MCP tools and 12 built-in expert types.');
    expect(found.map((f) => f.text).sort()).toEqual(['12 built-in expert types', '46 MCP tools']);
  });

  it('de-duplicates repeated identical prose', () => {
    const found = findClaimMatches('46 MCP tools ... later, the 46 MCP tools again.');
    expect(found.filter((f) => f.text === '46 MCP tools')).toHaveLength(1);
  });

  it('does not match plain numeric prose (no false positives on versions/steps)', () => {
    const found = findClaimMatches('Phase 2 v2.3.0 has 3 steps and 90% coverage in 12 files.');
    expect(found).toHaveLength(0);
  });

  it('every pattern uses the global flag (matchAll contract)', () => {
    for (const p of CLAIM_PATTERNS) expect(p.regex.flags).toContain('g');
  });
});

describe('checkCoverage', () => {
  // RED before the gate existed: a doc claim with no registry entry was invisible.
  it('FAILS when a doc makes a quantified claim with no covering registry entry', () => {
    const { resolve, fs } = fakeReader({
      'README.md': 'The system exposes 46 MCP tools.',
    });
    // Registry covers a DIFFERENT claim — the "46 MCP tools" claim is orphaned.
    const registry = registryCovering('12 built-in expert types');
    const report = checkCoverage(registry, resolve, fs, ['README.md']);
    expect(report.passed).toBe(false);
    expect(report.uncovered).toEqual([
      { doc: 'README.md', pattern: 'MCP tool count', text: '46 MCP tools' },
    ]);
  });

  // Models silent removal: the doc still claims it, the registry entry is gone.
  it('FAILS on silent removal (registry shrank, doc claim remains)', () => {
    const { resolve, fs } = fakeReader({ 'README.md': 'Now with 46 MCP tools.' });
    const empty: ClaimsRegistry = {
      version: 1,
      claims: [registryCovering('46 MCP tools').claims[0]!],
    };
    expect(checkCoverage(empty, resolve, fs, ['README.md']).passed).toBe(true);
    // Drop the covering entry -> uncovered -> fail.
    const shrunk: ClaimsRegistry = { version: 1, claims: empty.claims.slice(1) };
    expect(shrunk.claims).toHaveLength(0);
    // A registry must have >=1 claim per schema, but coverage is pure over the
    // array; an empty claims list means nothing covers the doc claim.
    expect(checkCoverage(shrunk, resolve, fs, ['README.md']).passed).toBe(false);
  });

  it('PASSES when the registry covers the doc claim via subjectContains', () => {
    const { resolve, fs } = fakeReader({ 'README.md': 'The 46 MCP tools are available.' });
    const report = checkCoverage(registryCovering('46 MCP tools'), resolve, fs, ['README.md']);
    expect(report.passed).toBe(true);
    expect(report.uncovered).toEqual([]);
  });

  it('does not cross subjects: an entry for ARCHITECTURE.md cannot cover a README claim', () => {
    const { resolve, fs } = fakeReader({ 'README.md': '46 MCP tools' });
    const report = checkCoverage(registryCovering('46 MCP tools', 'ARCHITECTURE.md'), resolve, fs, [
      'README.md',
    ]);
    expect(report.passed).toBe(false);
  });

  it('FAILS when a declared doc does not exist — the rename vector (#5253)', () => {
    // This asserted `passed === true` under the title "skips docs that do not
    // exist", pinning the defect as intended behaviour.
    //
    // The module exists as the ANTI-GAMING inverse of claims-verify: it is meant
    // to catch silent removal and mask-by-addition of registry entries. Skipping
    // a missing doc handed it a third, EASIER gaming path its own header does not
    // list — rename README.md and the reverse-coverage arm certifies green having
    // read nothing. A gate defeated by `git mv` is not a gate.
    const { resolve, fs } = fakeReader({});
    const report = checkCoverage(registryCovering('46 MCP tools'), resolve, fs, ['MISSING.md']);

    expect(report.passed).toBe(false);
    expect(report.docsMissing).toEqual(['MISSING.md']);
    expect(report.docsScanned).toBe(0);
  });

  it('FAILS when ONE declared doc is missing but another was scanned', () => {
    // The realistic rename: README.md moves, ARCHITECTURE.md stays. Coverage is
    // partial, not absent, so `docsScanned > 0` is satisfied and only the
    // missing-doc clause can catch it.
    //
    // Added because mutation testing found the clause unpinned: dropping
    // `docsMissing.length === 0` from the verdict left all other tests green,
    // since every existing missing-doc case also scanned zero docs.
    const { resolve, fs } = fakeReader({ 'ARCHITECTURE.md': 'nothing quantified' });
    const report = checkCoverage(registryCovering('46 MCP tools'), resolve, fs, [
      'README.md',
      'ARCHITECTURE.md',
    ]);

    expect(report.docsScanned).toBe(1);
    expect(report.docsMissing).toEqual(['README.md']);
    expect(report.passed).toBe(false);
  });

  it('FAILS when the declared doc list is empty', () => {
    // The other way to scan nothing. `uncovered.length === 0` is true of a scan
    // that examined no documents at all.
    const { resolve, fs } = fakeReader({ 'README.md': 'no claims here' });
    const report = checkCoverage(registryCovering('46 MCP tools'), resolve, fs, []);

    expect(report.passed).toBe(false);
    expect(report.docsScanned).toBe(0);
  });

  it('reports how many docs it actually scanned', () => {
    // The pair that stops "always fail" from satisfying the two tests above,
    // and the number that makes a zero-doc run distinguishable from a clean one.
    const { resolve, fs } = fakeReader({
      'README.md': 'nothing quantified',
      'ARCHITECTURE.md': 'also nothing',
    });
    const report = checkCoverage(registryCovering('46 MCP tools'), resolve, fs, [
      'README.md',
      'ARCHITECTURE.md',
    ]);

    expect(report.passed).toBe(true);
    expect(report.docsScanned).toBe(2);
    expect(report.docsMissing).toEqual([]);
  });
});

describe('current honest repo state (GREEN)', () => {
  it('the real registry covers every sentinel claim in the real docs', () => {
    const registry = parseClaimsRegistry(readFileSync(REGISTRY_PATH, 'utf-8'));
    const report = checkCoverage(registry, (doc) => join(REPO_ROOT, doc), {
      exists: (p): boolean => {
        try {
          readFileSync(p);
          return true;
        } catch {
          return false;
        }
      },
      read: (p): string => readFileSync(p, 'utf-8'),
    });
    expect(report.uncovered).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('scans README.md and ARCHITECTURE.md by default', () => {
    expect(SCANNED_DOCS).toContain('README.md');
    expect(SCANNED_DOCS).toContain('ARCHITECTURE.md');
  });
});
