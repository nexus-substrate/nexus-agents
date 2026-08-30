/**
 * Tests for the env-schema coverage gate (#5142).
 *
 * The parser is the risky part. `check-cli-docs-drift` shipped two rounds of
 * false positives because it counted names that were merely MENTIONED, so the
 * comment cases below are the ones that matter most.
 */
import { describe, it, expect } from 'vitest';

import {
  stripComments,
  envUsesInFile,
  registeredNames,
  computeCoverage,
  type EnvUse,
} from './check-env-schema-coverage.js';

const emptyBaseline = { intentional: {}, debt: [] };

function names(uses: readonly EnvUse[]): string[] {
  return uses.map((u) => u.name);
}

describe('stripComments', () => {
  it('removes a line comment but keeps code on the same line', () => {
    expect(stripComments("const a = 'NEXUS_REAL'; // see NEXUS_MENTIONED")).toBe(
      "const a = 'NEXUS_REAL'; "
    );
  });

  it('removes a block comment while preserving line numbers', () => {
    const src = ['const a = 1;', '/* NEXUS_DOC_ONLY', '   still a comment */', 'const b = 2;'].join(
      '\n'
    );
    const out = stripComments(src);
    expect(out).not.toContain('NEXUS_DOC_ONLY');
    expect(out.split('\n')).toHaveLength(4);
  });

  it('does not treat // inside a string literal as a comment', () => {
    expect(stripComments(`const u = 'http://x/NEXUS_KEEP';`)).toContain('NEXUS_KEEP');
  });

  it('honours escaped quotes so a string does not end early', () => {
    const src = `const a = 'it\\'s'; const b = 'NEXUS_AFTER';`;
    expect(stripComments(src)).toContain('NEXUS_AFTER');
  });
});

describe('envUsesInFile', () => {
  it('finds a single-quoted literal', () => {
    expect(names(envUsesInFile(`const E = 'NEXUS_MCP_DEPTH';`, 'f.ts'))).toEqual([
      'NEXUS_MCP_DEPTH',
    ]);
  });

  it('finds a double-quoted literal', () => {
    expect(names(envUsesInFile(`const E = "NEXUS_QUOTED";`, 'f.ts'))).toEqual(['NEXUS_QUOTED']);
  });

  it('finds a bare process.env dotted access', () => {
    expect(names(envUsesInFile(`if (process.env.NEXUS_DOTTED) run();`, 'f.ts'))).toEqual([
      'NEXUS_DOTTED',
    ]);
  });

  it('finds an injected-env index access', () => {
    expect(names(envUsesInFile(`parse(env['NEXUS_INJECTED']);`, 'f.ts'))).toEqual([
      'NEXUS_INJECTED',
    ]);
  });

  it('ignores a variable named only in a comment', () => {
    const src = ['// NEXUS_JUST_DOCS is no longer read', '/** @see NEXUS_ALSO_DOCS */'].join('\n');
    expect(envUsesInFile(src, 'f.ts')).toEqual([]);
  });

  it('reports the correct line number after a block comment', () => {
    const src = ['/*', ' * preamble', ' */', `const E = 'NEXUS_LINE_FOUR';`].join('\n');
    expect(envUsesInFile(src, 'f.ts')[0]?.line).toBe(4);
  });
});

describe('registeredNames', () => {
  it('extracts unquoted Zod object keys, the shape the schema actually uses', () => {
    const schema = [
      'const S = z.object({',
      '  NEXUS_A: boolStr.optional(),',
      '  NEXUS_B: z',
      '});',
    ].join('\n');
    expect([...registeredNames(schema)].sort()).toEqual(['NEXUS_A', 'NEXUS_B']);
  });

  it('does not count a commented-out registration as registered', () => {
    // The schema carries several `// NEXUS_FOO removed in #NNNN` notes. Reading
    // those as live registrations would let a removed var pass the gate.
    const schema = ['const S = z.object({', '  // NEXUS_REMOVED: boolStr.optional(),', '});'].join(
      '\n'
    );
    expect(registeredNames(schema)).toEqual([]);
  });
});

describe('computeCoverage', () => {
  const use = (name: string): EnvUse => ({ name, file: 'a.ts', line: 1 });

  it('flags a read-but-unregistered variable', () => {
    const cov = computeCoverage([use('NEXUS_GHOST')], ['NEXUS_KNOWN'], emptyBaseline);
    expect(names(cov.newlyUnregistered)).toEqual(['NEXUS_GHOST']);
  });

  it('does not flag a registered variable', () => {
    const cov = computeCoverage([use('NEXUS_KNOWN')], ['NEXUS_KNOWN'], emptyBaseline);
    expect(cov.newlyUnregistered).toEqual([]);
  });

  it('suppresses a variable listed as debt', () => {
    const cov = computeCoverage([use('NEXUS_DEBT')], ['NEXUS_KNOWN'], {
      intentional: {},
      debt: ['NEXUS_DEBT'],
    });
    expect(cov.newlyUnregistered).toEqual([]);
    expect(cov.knownDebt).toEqual(['NEXUS_DEBT']);
  });

  it('suppresses a variable listed as intentional', () => {
    const cov = computeCoverage([use('NEXUS_V2_DELEATE')], ['NEXUS_KNOWN'], {
      intentional: { NEXUS_V2_DELEATE: 'typo fixture; must stay unknown' },
      debt: [],
    });
    expect(cov.newlyUnregistered).toEqual([]);
    // A typo fixture is not debt — it must never be registered.
    expect(cov.knownDebt).toEqual([]);
  });

  it('reports a baseline entry that is no longer read anywhere', () => {
    const cov = computeCoverage([use('NEXUS_KNOWN')], ['NEXUS_KNOWN'], {
      intentional: {},
      debt: ['NEXUS_DELETED_LONG_AGO'],
    });
    expect(cov.staleBaseline).toEqual(['NEXUS_DELETED_LONG_AGO']);
  });

  it('carries file and line through to the failure set for a fixable message', () => {
    const cov = computeCoverage(
      [{ name: 'NEXUS_GHOST', file: 'src/x.ts', line: 42 }],
      ['NEXUS_KNOWN'],
      emptyBaseline
    );
    expect(cov.newlyUnregistered[0]).toMatchObject({ file: 'src/x.ts', line: 42 });
  });
});
