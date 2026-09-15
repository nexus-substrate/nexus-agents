import { describe, expect, it } from 'vitest';
import { FindingSchema, ResolutionSchema, openFindings, readLedger } from './discovery-ledger.js';

const finding = {
  timestamp: '2026-09-15T10:00:00-04:00',
  severity: 'high',
  file: 'fixture.ts:12',
  description: 'Synthetic finding',
  foundDuring: 'fixture test',
  cwe: 'CWE-20',
};
const resolution = {
  kind: 'resolution',
  target: 'fixture-1',
  status: 'fixed',
  fixedIn: '#123',
  at: '2026-09-15T15:00:00Z',
  by: 'fixture-actor',
};

describe('discovery ledger schemas', () => {
  it('keeps unknown finding fields and raw optional statuses', () => {
    const input = { ...finding, id: 'fixture-1', status: 'verified-by-me', extra: { n: 1 } };
    expect(FindingSchema.parse(input)).toEqual(input);
    expect(FindingSchema.parse(finding)).toEqual(finding);
  });

  it.each(['fixed', 'accepted', 'duplicate', 'refuted'])(
    'accepts %s resolution records',
    (status) => {
      const input = { ...resolution, status, note: 'Synthetic explanation' };
      expect(ResolutionSchema.parse(input)).toEqual(input);
    }
  );

  it('accepts a minimal resolution without optional fields', () => {
    const { fixedIn: _fixedIn, ...minimal } = resolution;
    expect(ResolutionSchema.parse(minimal)).toEqual(minimal);
  });

  it.each([
    { ...resolution, status: 'resolved' },
    { ...resolution, at: 'yesterday' },
    { ...resolution, by: '' },
    { ...resolution, target: '' },
  ])('rejects malformed resolution records', (input) => {
    expect(ResolutionSchema.safeParse(input).success).toBe(false);
  });
});

describe('readLedger', () => {
  it('classifies every physical line into exactly one of four classes', () => {
    const first = { severity: 'high', title: 'Invented finding', component: 'fixture' };
    const text = [
      JSON.stringify(first),
      JSON.stringify(resolution),
      '{}',
      '{broken',
      'null',
      '[]',
      '42',
      '"text"',
      '',
    ].join('\n');
    expect(readLedger(text)).toEqual({
      findings: [first],
      resolutions: [resolution],
      shapeUnmeasured: [{ line: 3, keys: [] }],
      invalidLines: [4, 5, 6, 7, 8],
    });
  });

  it('retains only sorted keys and line numbers for unmeasured objects', () => {
    const text = [
      { summary: 'PRIVATE FIXTURE', component: 'fixture' },
      { kind: 'resolution' },
      { severity: 3 },
      { resolves: 3 },
    ]
      .map((record) => JSON.stringify(record))
      .join('\n');
    expect(readLedger(text)).toEqual({
      findings: [],
      resolutions: [],
      invalidLines: [],
      shapeUnmeasured: [
        { line: 1, keys: ['component', 'summary'] },
        { line: 2, keys: ['kind'] },
        { line: 3, keys: ['severity'] },
        { line: 4, keys: ['resolves'] },
      ],
    });
  });

  it('accepts every string-severity object and preserves all other values', () => {
    const input = {
      severity: 'custom',
      id: 123,
      status: null,
      timestamp: 'historical',
      kind: 'resolution',
      extra: { n: 1 },
    };
    expect(readLedger(JSON.stringify(input)).findings).toEqual([input]);
  });

  it('normalizes legacy resolves lines without requiring finding fields', () => {
    const input = {
      resolves: 'fixture-1',
      commit: 'fixture-commit',
      timestamp: 'historical-time',
      foundDuring: 'fixture-task',
      type: 'fix',
    };
    expect(readLedger(JSON.stringify(input)).resolutions).toEqual([
      {
        kind: 'resolution',
        target: 'fixture-1',
        status: 'fixed',
        fixedIn: 'fixture-commit',
        at: 'historical-time',
        by: 'fixture-task',
      },
    ]);
    expect(readLedger('{"resolves":"fixture-2"}').resolutions).toEqual([
      {
        kind: 'resolution',
        target: 'fixture-2',
        status: 'fixed',
        by: 'unknown',
      },
    ]);
  });

  it('names the empty ledger and treats blank physical records as invalid', () => {
    expect(readLedger('')).toEqual({
      findings: [],
      resolutions: [],
      shapeUnmeasured: [],
      invalidLines: [],
    });
    expect(readLedger(' \n\r\n').invalidLines).toEqual([1, 2]);
  });
});

describe('openFindings', () => {
  it('names the empty case with three empty buckets, even with orphan resolutions', () => {
    expect(openFindings([], [])).toEqual({ open: [], resolved: [], statusUnmeasured: [] });
    expect(openFindings([], [ResolutionSchema.parse(resolution)])).toEqual({
      open: [],
      resolved: [],
      statusUnmeasured: [],
    });
  });

  it.each([undefined, 'open', 'fixing', 'latent', 'issue-filed'])('counts %s as open', (status) => {
    const input = FindingSchema.parse({ ...finding, status });
    expect(openFindings([input], [])).toEqual({
      open: [input],
      resolved: [],
      statusUnmeasured: [],
    });
  });

  it.each(['fixed', 'resolved', 'accepted', 'duplicate', 'refuted', 'wontfix'])(
    'counts canonical %s as resolved',
    (status) => {
      const input = { ...finding, status };
      expect(openFindings([input], [])).toEqual({
        open: [],
        resolved: [input],
        statusUnmeasured: [],
      });
    }
  );

  it.each([
    'fixed-in-5385',
    'verified-by-me-CORRECTED',
    'partially-resolved',
    'Fixed',
    ' fixed ',
    '',
    null,
    7,
    { note: 'fixture' },
  ])('keeps raw %s status unmeasured', (status) => {
    const input = { ...finding, status };
    expect(openFindings([input], [])).toEqual({
      open: [],
      resolved: [],
      statusUnmeasured: [input],
    });
  });

  it.each(['id', 'timestamp', 'discoveredAt', 'recordedAt', 'ts'])(
    'resolves the first available identity field %s with either resolution shape',
    (key) => {
      const input = { severity: 'high', [key]: 'fixture-target', status: 'ad-hoc' };
      for (const event of [
        { ...resolution, target: 'fixture-target' },
        { resolves: 'fixture-target' },
      ]) {
        const ledger = readLedger(
          [input, event].map((record) => JSON.stringify(record)).join('\n')
        );
        expect(openFindings(ledger.findings, ledger.resolutions)).toEqual({
          open: [],
          resolved: [input],
          statusUnmeasured: [],
        });
      }
    }
  );

  it.each([
    { id: 'chosen', timestamp: 'ignored' },
    { timestamp: 'chosen', discoveredAt: 'ignored' },
    { discoveredAt: 'chosen', recordedAt: 'ignored' },
    { recordedAt: 'chosen', ts: 'ignored' },
  ])('uses one identity in priority order: %j', (identity) => {
    const input = { severity: 'high', ...identity };
    const ignored = ResolutionSchema.parse({ ...resolution, target: 'ignored' });
    expect(openFindings([input], [ignored]).open).toEqual([input]);
    const chosen = ResolutionSchema.parse({ ...resolution, target: 'chosen' });
    expect(openFindings([input], [chosen]).resolved).toEqual([input]);
  });

  it.each([
    { resolvedAt: 'fixture-time' },
    { resolvedAt: null },
    { resolution: 'fixture fix' },
    { resolution: '' },
  ])('recognizes inline closure evidence %j even with an ad-hoc status', (closure) => {
    const input = { severity: 'high', status: 'verified-by-fixture', ...closure };
    expect(openFindings([input], []).resolved).toEqual([input]);
  });

  it('keeps identity-free findings open and does not infer closure from non-string resolution', () => {
    const input = { severity: 'low', resolution: { note: 'not a closure string' } };
    expect(openFindings([input], [ResolutionSchema.parse(resolution)]).open).toEqual([input]);
  });

  it('does not close an unrelated finding or infer closure from prose', () => {
    const input = { ...finding, description: 'Fixed: just fixture text' };
    expect(openFindings([input], [ResolutionSchema.parse(resolution)])).toEqual({
      open: [input],
      resolved: [],
      statusUnmeasured: [],
    });
  });
});
