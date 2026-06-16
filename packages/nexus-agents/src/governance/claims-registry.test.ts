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

describe('subject verification (#3877)', () => {
  // The core regression: the gate must ALSO check the doc making the claim,
  // not just the source-of-truth side. A README that drifts must FAIL.
  it('FAILS when the subject doc drifts from the source (doc-drift regression)', () => {
    const claim = baseClaim({
      id: 'mcp-tool-count',
      subject: 'README.md',
      verification: {
        method: 'manifest-tool-count',
        path: 'src/mcp/tools/tool-manifest.ts',
        expected: 46,
        subjectContains: '46 MCP tools',
      },
    });
    const fs = fakeFs({
      // Source-of-truth genuinely has 46 tools...
      '/repo/src/mcp/tools/tool-manifest.ts': Array.from(
        { length: 46 },
        (_v, i) => `  name: 'tool_${String(i)}',`
      ).join('\n'),
      // ...but the README drifted to claim 200. The gate must catch this.
      '/repo/README.md': 'The system exposes 200 MCP tools across many surfaces.',
    });
    const r = verifyClaim(claim, '/repo', fs);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('subject README.md');
    expect(r.detail).toContain('46 MCP tools');
  });

  it('passes when both source and subject agree', () => {
    const claim = baseClaim({
      id: 'mcp-tool-count',
      subject: 'README.md',
      verification: {
        method: 'manifest-tool-count',
        path: 'src/mcp/tools/tool-manifest.ts',
        expected: 2,
        subjectContains: '2 MCP tools',
      },
    });
    const fs = fakeFs({
      '/repo/src/mcp/tools/tool-manifest.ts': `  name: 'a',\n  name: 'b',`,
      '/repo/README.md': 'We ship 2 MCP tools today.',
    });
    expect(verifyClaim(claim, '/repo', fs).ok).toBe(true);
  });

  it('fails when the subject doc itself is missing', () => {
    const claim = baseClaim({
      verification: {
        method: 'file-contains',
        path: 'src/audit.ts',
        expected: 'export function verifyChain',
        subjectContains: 'verifyChain',
      },
    });
    const fs = fakeFs({ '/repo/src/audit.ts': 'export function verifyChain() {}' });
    const r = verifyClaim(claim, '/repo', fs);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('subject doc missing');
  });

  it('does not run a subject check when subjectContains is absent (back-compat)', () => {
    const claim = baseClaim({
      verification: { method: 'file-exists', path: 'src/dir' },
    });
    const fs = fakeFs({ '/repo/src/dir': '' });
    expect(verifyClaim(claim, '/repo', fs).ok).toBe(true);
  });
});

describe('file-contains comment hardening (#3879)', () => {
  it('does NOT match a needle that only appears in a line comment', () => {
    const claim = baseClaim({
      verification: {
        method: 'file-contains',
        path: 'src/manifest.ts',
        expected: 'verify_audit_chain',
      },
    });
    const fs = fakeFs({
      '/repo/src/manifest.ts': `// removed verify_audit_chain tool\nname: 'orchestrate',`,
      '/repo/README.md': 'mentions verify_audit_chain',
    });
    const r = verifyClaim(claim, '/repo', fs);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('only in comments');
  });

  it('does NOT match a needle that only appears in a block comment', () => {
    const claim = baseClaim({
      verification: {
        method: 'file-contains',
        path: 'src/manifest.ts',
        expected: 'verify_audit_chain',
      },
    });
    const fs = fakeFs({
      '/repo/src/manifest.ts': `/* legacy: verify_audit_chain */\nname: 'orchestrate',`,
      '/repo/README.md': 'mentions verify_audit_chain',
    });
    expect(verifyClaim(claim, '/repo', fs).ok).toBe(false);
  });

  it('matches a needle present in real code (comments stripped)', () => {
    const claim = baseClaim({
      verification: {
        method: 'file-contains',
        path: 'src/manifest.ts',
        expected: 'verify_audit_chain',
      },
    });
    const fs = fakeFs({
      '/repo/src/manifest.ts': `// the verify_audit_chain tool\nname: 'verify_audit_chain',`,
      '/repo/README.md': 'mentions verify_audit_chain',
    });
    expect(verifyClaim(claim, '/repo', fs).ok).toBe(true);
  });
});

describe('source-contains-all (#3879 substantive checks)', () => {
  it('passes only when ALL needles are present in real code', () => {
    const claim = baseClaim({
      verification: {
        method: 'source-contains-all',
        path: 'src/router.ts',
        expected: 'LinUCB,TOPSIS',
      },
    });
    const ok = fakeFs({
      '/repo/src/router.ts': `import { LinUCBBandit } from './x';\n// TOPSIS\nrunTOPSIS();`,
    });
    expect(verifyClaim(claim, '/repo', ok).ok).toBe(true);
  });

  it('fails when one needle is missing (e.g. TOPSIS deleted)', () => {
    const claim = baseClaim({
      verification: {
        method: 'source-contains-all',
        path: 'src/router.ts',
        expected: 'LinUCB,TOPSIS',
      },
    });
    const bad = fakeFs({ '/repo/src/router.ts': `import { LinUCBBandit } from './x';` });
    const r = verifyClaim(claim, '/repo', bad);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('TOPSIS');
  });

  it('fails when a needle appears only inside a comment', () => {
    const claim = baseClaim({
      verification: {
        method: 'source-contains-all',
        path: 'src/router.ts',
        expected: 'LinUCB,TOPSIS',
      },
    });
    const bad = fakeFs({
      '/repo/src/router.ts': `const x = new LinUCBBandit();\n// TODO: TOPSIS removed`,
    });
    expect(verifyClaim(claim, '/repo', bad).ok).toBe(false);
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
