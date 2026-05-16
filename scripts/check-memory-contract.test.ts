/**
 * Tests for the Phase 8 memory-contract drift gate.
 *
 * Pins the classifier on synthetic input; the live `scan()` over the
 * actual repo is exercised by the script's `main()` and the CI gate.
 *
 * @module scripts/check-memory-contract.test
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  newOffenders,
  readBaseline,
  scanFile,
  type Baseline,
  type ContractFinding,
} from './check-memory-contract.js';

describe('scanFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'memory-contract-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('flags `new Database(` outside packages/nexus-memory', () => {
    const file = join(tmpDir, 'offender.ts');
    writeFileSync(
      file,
      "import Database from 'better-sqlite3';\nconst db = new Database('x.db');\n"
    );
    const findings = scanFile(file);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.probeId).toBe('better-sqlite3-direct');
  });

  it('flags `new MobiMem(` constructions (use getSharedMobiMem)', () => {
    const file = join(tmpDir, 'offender.ts');
    writeFileSync(file, "const m = new MobiMem({ dbPath: '/tmp/x.db' });\n");
    const findings = scanFile(file);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.probeId).toBe('mobimem-direct-construct');
  });

  it('flags string references to outcomes.jsonl', () => {
    const file = join(tmpDir, 'offender.ts');
    writeFileSync(file, "const p = '~/.nexus-agents/learning/outcomes.jsonl';\n");
    const findings = scanFile(file);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.probeId).toBe('outcomes-jsonl-path');
  });

  it('ignores comments — historical references in JSDoc do not count', () => {
    const file = join(tmpDir, 'comment.ts');
    writeFileSync(
      file,
      [
        '/**',
        " * The legacy `new Database('mobimem.db')` pattern was deleted in #2770.",
        ' */',
        '// Avoid `new MobiMem()` directly; use getSharedMobiMem().',
        '//   /tmp/outcomes.jsonl is historical, see #2766 Phase 6.',
        'export const ok = true;',
      ].join('\n')
    );
    expect(scanFile(file)).toHaveLength(0);
  });

  it('emits one finding per offending line, with correct line numbers', () => {
    const file = join(tmpDir, 'multi.ts');
    writeFileSync(
      file,
      [
        "import Database from 'better-sqlite3';", // line 1
        "const a = new Database('a.db');", // line 2
        "const b = new Database('b.db');", // line 3
      ].join('\n')
    );
    const findings = scanFile(file);
    expect(findings).toHaveLength(2);
    expect(findings[0]?.line).toBe(2);
    expect(findings[1]?.line).toBe(3);
  });

  it('does NOT flag `new DatabaseAdapter(` (boundary-aware probe)', () => {
    const file = join(tmpDir, 'sibling-class.ts');
    writeFileSync(
      file,
      [
        'class DatabaseAdapter {}',
        'class DatabaseHelper {}',
        'const a = new DatabaseAdapter();',
        'const b = new DatabaseHelper();',
      ].join('\n')
    );
    expect(scanFile(file)).toHaveLength(0);
  });

  it('does NOT flag `new MobiMemAdapter(` (boundary-aware probe)', () => {
    const file = join(tmpDir, 'sibling-mobimem.ts');
    writeFileSync(file, 'class MobiMemAdapter {}\nconst m = new MobiMemAdapter();\n');
    expect(scanFile(file)).toHaveLength(0);
  });
});

describe('newOffenders', () => {
  function f(file: string, probeId: string): ContractFinding {
    return { file, line: 1, probeId, snippet: '...' };
  }

  it('returns findings absent from the baseline', () => {
    const baseline: Baseline = {
      entries: [{ file: 'old.ts', probeId: 'better-sqlite3-direct' }],
    };
    const offenders = newOffenders(
      [f('old.ts', 'better-sqlite3-direct'), f('new.ts', 'better-sqlite3-direct')],
      baseline
    );
    expect(offenders.map((o) => o.file)).toEqual(['new.ts']);
  });

  it('treats baseline as empty when omitted', () => {
    expect(newOffenders([f('a.ts', 'mobimem-direct-construct')], { entries: [] })).toHaveLength(1);
  });
});

describe('readBaseline', () => {
  it('returns empty baseline when file is missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'baseline-'));
    expect(readBaseline(join(tmp, 'nope.json')).entries).toEqual([]);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('parses a valid baseline file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'baseline-'));
    const path = join(tmp, 'b.json');
    writeFileSync(
      path,
      JSON.stringify({
        entries: [{ file: 'x.ts', probeId: 'better-sqlite3-direct' }],
      })
    );
    expect(readBaseline(path).entries).toHaveLength(1);
    rmSync(tmp, { recursive: true, force: true });
  });
});
