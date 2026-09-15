/** Operator redaction: real ledger fixtures and the governor's admission gate (#6265). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult } from '../packages/nexus-agents/src/cli/vote-types.js';
import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import * as audit from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  buildVoteRecord,
  parseVoteRecordsText,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';
import { evaluateLedgerEvidence } from './governor-ledger-evidence.js';
import { parseRedactArgs } from './redact-vote-record-args.js';
import { redactVoteRecord, type RedactOutcome } from './redact-vote-record.js';

const SHA = 'a'.repeat(40);
const AT = '2026-09-15T00:00:00.000Z';
function fixture(id = 'target', sequence = 0): VoteRecord {
  const votes: AgentVoteResult[] = ['architect', 'security', 'scope_steward'].map((role) => ({
    role: role as AgentVoteResult['role'],
    vote: { decision: 'approve', confidence: 0.8, reasoning: `because ${role}` },
    processingTimeMs: 10,
    source: 'llm',
  }));
  return buildVoteRecord({
    id,
    sequence,
    recordedAt: AT,
    proposal: 'Ratify fixture',
    strategy: 'supermajority',
    declaredOptions: undefined,
    resolvedDecision: 'approved',
    votes,
    errorPolicy: 'absolute_quorum',
    ratifiesPr: { pr: 6265, headSha: SHA },
    result: {
      proposalId: 'proposal',
      proposal: { title: 'T', description: 'D', algorithm: 'supermajority' },
      outcome: 'approved',
      votes: new Map(),
      voteCounts: { approve: 3, reject: 0, abstain: 0, total: 3 },
      approvalPercentage: 100,
      quorumReached: true,
      startedAt: AT,
      closedAt: AT,
      durationMs: 5,
    },
  });
}

describe('redactVoteRecord', () => {
  let dir: string;
  let ledgerPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'redact-vote-'));
    ledgerPath = join(dir, 'vote-records.jsonl');
    writeFileSync(ledgerPath, JSON.stringify(fixture()) + '\n');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function run(roles: readonly string[] = ['architect'], recordId = 'target'): RedactOutcome {
    return redactVoteRecord({
      ledgerPath,
      recordId,
      roles,
      by: 'operator',
      reason: 'remove private context',
    });
  }
  function refused(
    message: string,
    roles: readonly string[] = ['architect'],
    recordId = 'target'
  ): void {
    const before = readFileSync(ledgerPath, 'utf8');
    expect(run(roles, recordId)).toMatchObject({
      kind: 'refused',
      detail: expect.stringContaining(message),
    });
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before);
    expect(readdirSync(dir)).toEqual(['vote-records.jsonl']);
  }

  it('redacts only named openings, preserving key order and passing the real append-only gate', () => {
    const original = fixture();
    // Deliberately use caller key order, including nested objects, not Zod's order.
    const reordered = {
      previousHash: 'b'.repeat(64),
      ...Object.fromEntries(Object.entries(original).reverse()),
      voters: original.voters.map((v) => Object.fromEntries(Object.entries(v).reverse())),
    };
    const line = JSON.stringify(reordered);
    const other = JSON.stringify(fixture('other', 1));
    const base = line + '\n\n' + other; // Preserve blank lines and handle a missing final newline.
    writeFileSync(ledgerPath, base);
    const outcome = run(['architect', 'security']);
    expect(outcome).toMatchObject({ kind: 'redacted', signing: 'unsigned-unsupported' });
    const head = readFileSync(ledgerPath, 'utf8');
    const expected: VoteRecord = JSON.parse(line) as VoteRecord;
    for (const v of expected.voters) {
      if (v.role === 'architect' || v.role === 'security') {
        delete v.reasoning;
        delete v.reasoningNonce;
      }
    }
    expect(head.split('\n').slice(0, 3)).toEqual([JSON.stringify(expected), '', other]);
    const parsed = parseVoteRecordsText(head);
    expect(parsed.invalidLines).toEqual([]);
    expect(parsed.redactions).toEqual([
      expect.objectContaining({
        kind: 'redaction',
        targetId: 'target',
        targetVoterRoles: ['architect', 'security'],
        sequence: 2,
        by: 'operator',
        reason: 'remove private context',
      }),
    ]);
    expect(audit.verifyVoteRecordSet(parsed.records, parsed.redactions)).toMatchObject({
      ok: true,
      redacted: [{ recordId: 'target', voterRoles: ['architect', 'security'] }],
    });
    expect(
      evaluateLedgerEvidence({
        ledgerText: head,
        baseLedgerText: base,
        pr: 6265,
        head: { sha: SHA, commitFiles: ['scripts/redact-vote-record.ts'] },
      })
    ).toMatchObject({
      kind: 'ratified',
      appendOnlyChecked: true,
    });
  });

  it('appends past existing redactions and preserves another record’s redacted state', () => {
    writeFileSync(
      ledgerPath,
      [fixture(), fixture('other', 1)].map((r) => JSON.stringify(r)).join('\n') + '\n'
    );
    expect(run(['security'], 'other').kind).toBe('redacted');
    const before = readFileSync(ledgerPath, 'utf8').split('\n');
    expect(run().kind).toBe('redacted');
    const text = readFileSync(ledgerPath, 'utf8');
    expect(text.split('\n').slice(1, 3)).toEqual(before.slice(1, 3));
    const parsed = parseVoteRecordsText(text);
    expect(parsed.redactions.map((r) => r.sequence)).toEqual([2, 3]);
    expect(audit.verifyVoteRecordSet(parsed.records, parsed.redactions)).toMatchObject({
      ok: true,
      redacted: [
        expect.objectContaining({ recordId: 'target' }),
        expect.objectContaining({ recordId: 'other' }),
      ],
    });
  });
  it('refuses unknown ids', () => {
    refused('unknown record id', ['architect'], 'missing');
  });
  it('names the empty ledger as an unknown target', () => {
    writeFileSync(ledgerPath, '');
    refused('unknown record id');
  });
  it('refuses the pre-digest tier as a history rewrite', () => {
    const record = fixture();
    record.version = '1.12';
    for (const v of record.voters) {
      delete v.reasoningNonce;
      delete v.reasoningDigest;
    }
    record.hash = audit.computeVoteRecordHash(record);
    writeFileSync(ledgerPath, JSON.stringify(record) + '\n');
    refused('redaction here is a history rewrite; not performed');
  });
  it('refuses missing roles', () => {
    refused('no entry', ['absent']);
  });
  it('refuses an already redacted opening', () => {
    expect(run().kind).toBe('redacted');
    refused('no opening');
  });
  it('refuses a voter that never had an opening', () => {
    const record = fixture();
    for (const v of record.voters) {
      delete v.reasoning;
      delete v.reasoningNonce;
      delete v.reasoningDigest;
    }
    record.hash = audit.computeVoteRecordHash(record);
    writeFileSync(ledgerPath, JSON.stringify(record));
    refused('no opening');
  });
  it('refuses zero roles', () => {
    refused('at least one role', []);
  });
  it('refuses lossy UTF-8 decoding without altering any ledger byte', () => {
    const line = JSON.stringify({ ...fixture(), previousHash: '\ufffd' + 'b'.repeat(63) });
    const [prefix, suffix] = line.split('\ufffd');
    const bytes = Buffer.concat([Buffer.from(prefix!), Buffer.from([0xff]), Buffer.from(suffix!)]);
    writeFileSync(ledgerPath, bytes);
    expect(run()).toMatchObject({ kind: 'refused', detail: expect.stringContaining('UTF-8') });
    expect(readFileSync(ledgerPath)).toEqual(bytes);
  });
  it.each([' ', '\t'])('refuses noncanonical target bytes (%j)', (prefix) => {
    writeFileSync(ledgerPath, prefix + readFileSync(ledgerPath, 'utf8'));
    refused('canonical JSON.stringify');
  });
  it('refuses ambiguous duplicate target lines', () => {
    const text = readFileSync(ledgerPath, 'utf8');
    writeFileSync(ledgerPath, text + text);
    refused('multiple');
  });
  it('refuses an invalid ledger', () => {
    writeFileSync(ledgerPath, readFileSync(ledgerPath, 'utf8') + '{}\n');
    refused('invalid');
  });
  it('refuses a broken commitment before dropping the evidence', () => {
    const record = fixture();
    record.voters[0]!.reasoning = 'tampered';
    writeFileSync(ledgerPath, JSON.stringify(record));
    refused('hash_mismatch');
  });
  it('refuses an unsafe next sequence before verifying a huge census', () => {
    const record = fixture('target', Number.MAX_SAFE_INTEGER);
    writeFileSync(ledgerPath, JSON.stringify(record));
    refused('sequence');
  });
  it('refuses candidate verification failure and leaves the ledger byte-identical', () => {
    const realVerify = audit.verifyVoteRecordSet;
    vi.spyOn(audit, 'verifyVoteRecordSet').mockImplementationOnce(realVerify).mockReturnValueOnce({
      ok: false,
      reason: 'redaction_unbound',
      recordIndex: 0,
      recordId: 'target',
      detail: 'injected candidate failure',
    });
    refused('redaction_unbound');
  });
  it('refuses an ok candidate that does not actually report the target redacted', () => {
    const realVerify = audit.verifyVoteRecordSet;
    vi.spyOn(audit, 'verifyVoteRecordSet')
      .mockImplementationOnce(realVerify)
      .mockReturnValueOnce({ ok: true, recordCount: 2 });
    refused('target is not redacted');
  });
  it('validates metadata before writing', () => {
    const before = readFileSync(ledgerPath, 'utf8');
    expect(
      redactVoteRecord({
        ledgerPath,
        recordId: 'target',
        roles: ['architect'],
        by: '',
        reason: 'why',
      }).kind
    ).toBe('refused');
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before);
  });
  it('CLI reports unsigned support and refuses bad input with exit 1 and one line', () => {
    const args = [
      '--ledger',
      ledgerPath,
      '--record-id',
      'target',
      '--by',
      'operator',
      '--reason',
      'private',
    ];
    const invoke = (extra: string[]): SpawnSyncReturns<string> =>
      spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/redact-vote-record.ts', ...args, ...extra],
        { encoding: 'utf8', timeout: 30000 }
      );
    const bad = invoke([]);
    expect(bad.status).toBe(1);
    expect(bad.stderr.trim().split('\n')).toHaveLength(1);
    const good = invoke(['--role', 'architect', '--signing-key', '/unused/key', '--as-owner']);
    expect(good.status).toBe(0);
    expect(good.stdout).toContain('UNSIGNED');
    expect(good.stdout).toContain('redaction');
  });
});

describe('parseRedactArgs', () => {
  const required = [
    '--ledger',
    'ledger',
    '--record-id',
    'id',
    '--by',
    'actor',
    '--reason',
    'reason',
  ];
  it('requires at least one role', () => {
    expect(parseRedactArgs(required)).toMatchObject({
      ok: false,
      error: expect.stringContaining('at least one role'),
    });
  });
  it('accepts repeatable roles and signing flags', () => {
    expect(
      parseRedactArgs([
        ...required,
        '--role',
        'architect',
        '--role',
        'security',
        '--signing-key',
        'key',
        '--as-owner',
      ])
    ).toMatchObject({
      ok: true,
      roles: ['architect', 'security'],
      signingKeyPath: 'key',
      asOwner: true,
    });
  });
  it.each(
    [
      [],
      ['--wat'],
      [...required, '--role'],
      [...required, '--role', ''],
      [...required, '--role', 'architect', '--by', 'duplicate'],
    ].map((argv) => ({ argv }))
  )('refuses missing, empty, unknown or duplicate scalar arguments: %j', ({ argv }) => {
    expect(parseRedactArgs(argv).ok).toBe(false);
  });
});
