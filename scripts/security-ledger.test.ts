import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('./security-ledger.ts', import.meta.url));
const TIMESTAMP = '2026-09-15T12:00:00Z';
const finding = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    timestamp: TIMESTAMP,
    severity: 'high',
    file: 'src/example.ts',
    description: 'Fixture finding',
    foundDuring: '#4887 test',
    cwe: 'CWE-20',
    id: 'fixture-1',
    ...extra,
  });
let directory: string;
let ledger: string;

function run(...args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, ...args, '--ledger', ledger], {
    encoding: 'utf8',
    timeout: 20_000,
  });
}

function resolve(...args: string[]): ReturnType<typeof run> {
  return run(
    'resolve',
    '--target',
    'fixture-1',
    '--status',
    'fixed',
    '--by',
    'fixture-actor',
    ...args
  );
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'security-ledger-test-'));
  ledger = join(directory, 'fixture.jsonl');
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('security ledger CLI', () => {
  it('reports counts and open summaries plus unmeasured raw statuses', () => {
    writeFileSync(
      ledger,
      [
        finding({ summary: 'Fixture summary' }),
        finding({ id: 'closed', status: 'fixed' }),
        finding({ id: 'drift', status: 'fixed-in-5385' }),
      ].join('\n')
    );
    const result = run('open');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('open: 1');
    expect(result.stdout).toContain('resolved: 1');
    expect(result.stdout).toContain('status-unmeasured: 1');
    expect(result.stdout).toContain('invalid lines: 0');
    expect(result.stdout).toContain('high fixture-1 src/example.ts Fixture summary');
    expect(result.stdout).toContain('fixed-in-5385');
  });

  it('reports counts only without any private record values or key sets', () => {
    writeFileSync(
      ledger,
      [
        { severity: 'high', title: 'PRIVATE FIXTURE' },
        { severity: 'low', id: 'closed-fixture' },
        { resolves: 'closed-fixture' },
        { severity: 'low', status: 'PRIVATE STATUS' },
        { privateKey: 'PRIVATE VALUE' },
        { severity: 'low', resolvedAt: 'fixture-time' },
      ]
        .map((record) => JSON.stringify(record))
        .join('\n')
    );
    const result = run('open', '--counts-only');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      'open: 1\nresolved: 2\nstatus-unmeasured: 1\nshape-unmeasured: 1\ninvalid lines: 0\n'
    );
    expect(result.stderr).toBe('');
  });

  it('lists shape-unmeasured records by line and key set only', () => {
    writeFileSync(ledger, '{"summary":"PRIVATE FIXTURE","component":"PRIVATE LOCATION"}');
    const result = run('open');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('shape-unmeasured: 1');
    expect(result.stdout).toContain('line 1: component,summary');
    expect(result.stdout).not.toContain('PRIVATE');
  });

  it.each([
    [
      {
        severity: 'high',
        id: 'fixture-id',
        timestamp: 'ignored',
        summary: 'summary',
        title: 'ignored',
        file: 'file',
        component: 'ignored',
      },
      'high fixture-id file summary',
    ],
    [
      { severity: 'high', discoveredAt: 'fixture-date', title: 'title', component: 'component' },
      'high fixture-date component title',
    ],
    [
      { severity: 'high', recordedAt: 'fixture-date', description: 'description', area: 'area' },
      'high fixture-date area description',
    ],
    [{ severity: 'high', ts: 'fixture-date', detail: 'detail' }, 'high fixture-date - detail'],
    [{ severity: 'high' }, 'high - - -'],
  ])('displays historical finding fallbacks %j', (input, label) => {
    writeFileSync(ledger, JSON.stringify(input));
    const result = run('open');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(label);
  });

  it('renders arbitrary JSON location values without coercion failures', () => {
    writeFileSync(
      ledger,
      JSON.stringify({ severity: 'high', file: { toString: 'fixture' }, title: 'invented' })
    );
    const result = run('open');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('high - {"toString":"fixture"} invented');
  });

  it.each(['discoveredAt', 'recordedAt', 'ts'])(
    'appends closure for identity fallback %s',
    (key) => {
      writeFileSync(ledger, JSON.stringify({ severity: 'low', [key]: 'fixture-1' }));
      expect(resolve().status).toBe(0);
      expect(run('open').stdout).toContain('resolved: 1');
    }
  );

  it('refuses an alias when the finding has a higher-priority identity', () => {
    writeFileSync(ledger, finding());
    const result = run('resolve', '--target', TIMESTAMP, '--status', 'fixed', '--by', 'fixture');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown target');
  });

  it('preserves unmeasured objects while appending a resolution', () => {
    const original = finding() + '\n{"fixtureKey":"private fixture"}';
    writeFileSync(ledger, original);
    expect(resolve().status).toBe(0);
    expect(readFileSync(ledger, 'utf8').slice(0, original.length)).toBe(original);
  });

  it('uses timestamp and description fallback, truncating descriptions to 80 characters', () => {
    writeFileSync(ledger, finding({ id: undefined, description: 'x'.repeat(100) }));
    const result = run('open');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`high ${TIMESTAMP} src/example.ts ${'x'.repeat(80)}\n`);
    expect(result.stdout).not.toContain('x'.repeat(81));
  });

  it.each(['', undefined])('names an empty or absent ledger as zero findings (%s)', (text) => {
    if (text !== undefined) writeFileSync(ledger, text);
    const result = run('open');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('open: 0');
    expect(result.stdout).toContain('resolved: 0');
    expect(result.stdout).toContain('status-unmeasured: 0');
    expect(result.stdout).toContain('invalid lines: 0');
  });

  it.each(['\n', ''])(
    'appends exactly one resolution preserving every existing byte (ending %j)',
    (ending) => {
      const original = `${finding()}${ending}`;
      writeFileSync(ledger, original);
      const result = resolve('--fixed-in', '#4887', '--note', 'Fixture closure');
      expect(result.status).toBe(0);
      const updated = readFileSync(ledger, 'utf8');
      expect(updated.slice(0, original.length)).toBe(original);
      const lines = updated.trimEnd().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[1] ?? '')).toEqual({
        kind: 'resolution',
        target: 'fixture-1',
        status: 'fixed',
        fixedIn: '#4887',
        by: 'fixture-actor',
        note: 'Fixture closure',
        at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
      expect(readdirSync(directory)).toEqual(['fixture.jsonl']);
      const report = run('open');
      expect(report.status).toBe(0);
      expect(report.stdout).toContain('resolved: 1');
      expect(report.stdout).toContain('open: 0');
    }
  );

  it('preserves CRLF, Unicode and every original byte across multiple findings', () => {
    const text = `${finding({ description: 'Fixture café 🛡' })}\r\n${finding({ id: 'other', description: 'BYTE_MARKER' })}\r\n`;
    const [before, after] = text.split('BYTE_MARKER');
    const original = Buffer.concat([
      Buffer.from(before ?? ''),
      Buffer.from([0xff]),
      Buffer.from(after ?? ''),
    ]);
    writeFileSync(ledger, original);
    expect(resolve().status).toBe(0);
    const updated = readFileSync(ledger);
    expect(updated.subarray(0, original.length)).toEqual(original);
    expect(updated.subarray(original.length).toString('utf8').trim().split('\n')).toHaveLength(1);
  });

  it('resolves a timestamp target with a canonical non-fixed status', () => {
    writeFileSync(ledger, finding({ id: undefined }));
    expect(
      run('resolve', '--target', TIMESTAMP, '--status', 'accepted', '--by', 'fixture-actor').status
    ).toBe(0);
    expect(run('open').stdout).toContain('resolved: 1');
  });

  it('refuses unknown targets without modifying the ledger', () => {
    const original = finding({ id: 'other' });
    writeFileSync(ledger, original);
    const result = resolve();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown target');
    expect(readFileSync(ledger, 'utf8')).toBe(original);
  });

  it('refuses an already-resolved target without appending again', () => {
    writeFileSync(ledger, finding());
    expect(resolve().status).toBe(0);
    const original = readFileSync(ledger, 'utf8');
    const result = resolve();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already resolved');
    expect(readFileSync(ledger, 'utf8')).toBe(original);
  });

  it('refuses findings with canonical closed status', () => {
    const original = finding({ status: 'resolved' });
    writeFileSync(ledger, original);
    expect(resolve().status).toBe(1);
    expect(readFileSync(ledger, 'utf8')).toBe(original);
  });

  it('refuses ambiguous targets without modifying the ledger', () => {
    const original = [
      finding(),
      finding({ id: 'fixture-1', timestamp: '2026-09-15T13:00:00Z' }),
    ].join('\n');
    writeFileSync(ledger, original);
    expect(resolve().status).toBe(1);
    expect(readFileSync(ledger, 'utf8')).toBe(original);
  });

  it('reports invalid line numbers without echoing malformed contents and refuses resolve', () => {
    const original = `${finding()}\nDO-NOT-PRINT-INVALID-FIXTURE\n{}\n`;
    writeFileSync(ledger, original);
    const result = run('open');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('invalid lines: 1');
    expect(result.stdout).toContain('shape-unmeasured: 1');
    expect(result.stderr.trim()).toBe('Invalid ledger lines: 2');
    expect(result.stdout + result.stderr).not.toContain('DO-NOT-PRINT-INVALID-FIXTURE');
    expect(resolve().status).toBe(1);
    expect(readFileSync(ledger, 'utf8')).toBe(original);
  });

  it('refuses concurrent writing when the ledger lock is held', () => {
    const original = finding();
    writeFileSync(ledger, original);
    writeFileSync(`${ledger}.lock`, '');
    expect(resolve().status).toBe(1);
    expect(readFileSync(ledger, 'utf8')).toBe(original);
    expect(readdirSync(directory)).toContain('fixture.jsonl.lock');
  });

  it.each([
    ['--status', 'verified'],
    ['--by', ''],
    ['--unexpected', 'value'],
  ])('rejects invalid resolve arguments %j', (flag, value) => {
    const original = finding();
    writeFileSync(ledger, original);
    expect(resolve(flag, value).status).toBe(1);
    expect(readFileSync(ledger, 'utf8')).toBe(original);
  });
});
