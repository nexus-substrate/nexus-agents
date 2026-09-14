import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectControlByteTargets } from './arch-lint.js';
import { checkControlBytes } from './arch-lint-control-bytes.js';
import { ROOT } from './script-paths.js';

const rootFile = (rel: string): string => join(ROOT, rel);
const UNBASELINED = 'packages/nexus-agents/src/mcp/tools/thing.ts';

/** Fixtures are built from escapes so this test file never carries a raw byte itself. */
const withByte = (code: number): string =>
  ['const a = 1;', `const sep = '${String.fromCharCode(code)}';`, 'export { a, sep };'].join('\n');

describe('checkControlBytes — no raw control byte in source (#6149)', () => {
  it('names file:line:col and the byte for a raw NUL, as an error', () => {
    const violations = checkControlBytes(rootFile(UNBASELINED), withByte(0));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe('error');
    expect(violations[0]?.rule).toBe('control-bytes');
    expect(violations[0]?.file).toBe(UNBASELINED);
    expect(violations[0]?.line).toBe(2);
    // `const sep = '` is 13 characters, so the byte sits at column 14.
    expect(violations[0]?.message).toContain(`${UNBASELINED}:2:14 raw control byte 0x00`);
  });

  it.each(['01', '08', '0b', '0c', '0e', '1b', '1f'])('flags raw byte 0x%s', (hex) => {
    expect(checkControlBytes(rootFile(UNBASELINED), withByte(parseInt(hex, 16)))).toHaveLength(1);
  });

  it.each(['09', '0a', '0d', '20', '7f'])('accepts byte 0x%s (whitespace or not C0)', (hex) => {
    expect(checkControlBytes(rootFile(UNBASELINED), withByte(parseInt(hex, 16)))).toEqual([]);
  });

  it('accepts the escape spelling of the same string', () => {
    const escaped = ['const a = 1;', "const sep = '\\0';", 'export { a, sep };'].join('\n');
    expect(checkControlBytes(rootFile(UNBASELINED), escaped)).toEqual([]);
  });

  it('reports one violation per offending line, not per byte', () => {
    const nul = String.fromCharCode(0);
    const content = [`'${nul}${nul}'`, 'ok', `'${nul}'`].join('\n');
    const lines = checkControlBytes(rootFile(UNBASELINED), content).map((v) => v.line);
    expect(lines).toEqual([1, 3]);
  });

  it('the empty file is clean', () => {
    expect(checkControlBytes(rootFile(UNBASELINED), '')).toEqual([]);
  });

  it.each([
    'packages/nexus-agents/src/cli/vote-command.test.ts',
    'packages/nexus-agents/src/pipeline/research-context.ts',
  ])('the files #6161 baselined get no allowance any more: %s (#6158)', (file) => {
    const violations = checkControlBytes(rootFile(file), withByte(0x1b));
    expect(violations.map((v) => v.severity)).toEqual(['error']);
    expect(violations[0]?.message).not.toContain('baseline');
  });
});

describe('collectControlByteTargets', () => {
  it('walks package source AND scripts/, tests included', () => {
    const files = collectControlByteTargets();
    expect(files.length).toBeGreaterThan(100);
    expect(
      files.some((f) => f.endsWith('packages/nexus-agents/src/cli/vote-command.test.ts'))
    ).toBe(true);
    expect(files.some((f) => f.endsWith('scripts/arch-lint-control-bytes.test.ts'))).toBe(true);
  });
});

describe('the real tree carries no raw control byte (#6149, #6158)', () => {
  it('holds over every .ts file the lint walks', () => {
    // The guard the issue asked for. On origin/main before #6149 this named
    // packages/nexus-agents/src/mcp/tools/improvement-review.ts:613:52 (a NUL);
    // before #6158 it named vote-command.test.ts:197:21 (ESC) and
    // research-context.ts:69:16 (NUL) once the baseline allowance was removed.
    const files = collectControlByteTargets();
    const errors = files
      .flatMap((f) => checkControlBytes(f, readFileSync(f, 'utf-8')))
      .filter((v) => v.severity === 'error');

    expect(errors.map((v) => v.message)).toEqual([]);
  });
});
