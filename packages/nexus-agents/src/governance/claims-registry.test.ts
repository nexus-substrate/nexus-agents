/**
 * nexus-agents/governance - Claims registry schema + verification tests.
 *
 * @module governance/claims-registry.test
 * (Source: Issue #3824, #3825)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaimsRegistrySchema, parseClaimsRegistry, type ClaimEntry } from './claims-registry.js';
import {
  verifyClaim,
  verifyClaims,
  countEnumMembers,
  countManifestTools,
  type ClaimFs,
} from './claims-verify.js';

const REPO_ROOT = join(import.meta.dirname, '../../../..');
const REGISTRY_PATH = join(REPO_ROOT, 'governance/claims-registry.yaml');

/** Build an in-memory fs from a path -> content map. */
function fakeFs(files: Record<string, string>): ClaimFs {
  return {
    exists: (p): boolean => p in files,
    read: (p): string => files[p] ?? '',
  };
}

function baseClaim(overrides: Partial<ClaimEntry> = {}): ClaimEntry {
  return {
    id: 'sample-claim',
    claim: 'A sample claim under 25 words.',
    subject: 'README.md',
    status: 'verified',
    evidenceType: 'source',
    verification: { method: 'file-exists', path: 'src/thing.ts' },
    lastVerified: '2026-06-16',
    ...overrides,
  };
}

describe('claims registry schema', () => {
  it('parses and validates the real registry YAML', () => {
    const text = readFileSync(REGISTRY_PATH, 'utf-8');
    const registry = parseClaimsRegistry(text);
    expect(registry.version).toBeGreaterThan(0);
    expect(registry.claims.length).toBeGreaterThan(0);
    // Every id is unique and kebab-case.
    const ids = registry.claims.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects a malformed entry (bad id)', () => {
    const bad = { version: 1, claims: [baseClaim({ id: 'Bad ID' })] };
    expect(ClaimsRegistrySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a claim over 25 words', () => {
    const longText = Array.from({ length: 30 }, () => 'word').join(' ');
    const bad = { version: 1, claims: [baseClaim({ claim: longText })] };
    expect(ClaimsRegistrySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects duplicate claim ids', () => {
    const bad = { version: 1, claims: [baseClaim(), baseClaim()] };
    const result = ClaimsRegistrySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects unknown extra fields (strict)', () => {
    const bad = { version: 1, claims: [{ ...baseClaim(), bogus: true }] };
    expect(ClaimsRegistrySchema.safeParse(bad).success).toBe(false);
  });

  it('requires a numeric expected for enum-member-count', () => {
    const bad = {
      version: 1,
      claims: [
        baseClaim({
          verification: {
            method: 'enum-member-count',
            path: 'src/x.ts',
            symbol: 'FooSchema',
            expected: 'not-a-number',
          },
        }),
      ],
    };
    expect(ClaimsRegistrySchema.safeParse(bad).success).toBe(false);
  });
});

describe('verification helpers', () => {
  it('counts members of a z.enum', () => {
    const src = `export const FooSchema = z.enum(['a', 'b', 'c']);`;
    expect(countEnumMembers(src, 'FooSchema')).toBe(3);
  });

  it('counts members of a string-literal union', () => {
    const src = `export type Foo = 'a' | 'b' | 'c' | 'd';`;
    expect(countEnumMembers(src, 'Foo')).toBe(4);
  });

  it('returns null when the symbol is absent', () => {
    expect(countEnumMembers('const x = 1;', 'Missing')).toBeNull();
  });

  it('counts manifest tool name entries', () => {
    const src = `[{ name: 'orchestrate' }, { name: 'consensus_vote' }]`;
    expect(countManifestTools(src)).toBe(2);
  });
});

describe('verifyClaim', () => {
  it('passes a satisfied file-contains claim', () => {
    const claim = baseClaim({
      verification: {
        method: 'file-contains',
        path: 'src/audit.ts',
        expected: 'export function verifyChain',
      },
    });
    const fs = fakeFs({
      '/repo/src/audit.ts': 'export function verifyChain() {}',
      '/repo/README.md': 'mentions verifyChain ... export function verifyChain',
    });
    expect(verifyClaim(claim, '/repo', fs).ok).toBe(true);
  });

  it('fails when the evidence path is missing', () => {
    const claim = baseClaim({ verification: { method: 'file-exists', path: 'src/gone.ts' } });
    const fs = fakeFs({});
    const r = verifyClaim(claim, '/repo', fs);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('evidence path missing');
  });

  it('fails an intentionally-wrong enum count', () => {
    const claim = baseClaim({
      subject: 'README.md',
      verification: {
        method: 'enum-member-count',
        path: 'src/consensus.ts',
        symbol: 'ConsensusAlgorithmSchema',
        expected: 99,
      },
    });
    const fs = fakeFs({
      '/repo/src/consensus.ts': `export const ConsensusAlgorithmSchema = z.enum(['a','b']);`,
    });
    const r = verifyClaim(claim, '/repo', fs);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('expected 99');
  });

  it('fails an aspirational claim when the roadmap marker has vanished', () => {
    const claim = baseClaim({
      status: 'aspirational',
      subject: 'ARCHITECTURE.md',
      verification: {
        method: 'roadmap-status',
        path: 'ARCHITECTURE.md',
        expected: '| Phase 2 | v2.3.0  | Standalone CLI Mode      | -      |',
      },
    });
    const fs = fakeFs({
      // Phase 2 has shipped — the roadmap row no longer marks it `-`.
      '/repo/ARCHITECTURE.md': '| Phase 2 | v2.3.0  | Standalone CLI Mode      | YES |',
    });
    const r = verifyClaim(claim, '/repo', fs);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('no longer marks claim as roadmap');
  });

  it('passes an aspirational roadmap claim when the marker is present', () => {
    const claim = baseClaim({
      status: 'aspirational',
      subject: 'ARCHITECTURE.md',
      verification: {
        method: 'roadmap-status',
        path: 'ARCHITECTURE.md',
        expected: '| Phase 2 | v2.3.0  | Standalone CLI Mode      | -      |',
      },
    });
    const fs = fakeFs({
      '/repo/ARCHITECTURE.md':
        'roadmap\n| Phase 2 | v2.3.0  | Standalone CLI Mode      | -      |\n',
    });
    expect(verifyClaim(claim, '/repo', fs).ok).toBe(true);
  });
});

describe('verifyClaims against the live repo', () => {
  it('every populated claim holds against current source', () => {
    const registry = parseClaimsRegistry(readFileSync(REGISTRY_PATH, 'utf-8'));
    const report = verifyClaims(registry, REPO_ROOT);
    const failures = report.results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.detail}`);
    expect(failures).toEqual([]);
    expect(report.passed).toBe(true);
  });
});
