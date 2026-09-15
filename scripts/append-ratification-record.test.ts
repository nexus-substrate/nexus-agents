/**
 * Tests for the caller-commits append path (#5130 step 1).
 *
 * `appendRatificationRecord` copies ONE record out of the runtime vote-record
 * store into the committed `governance/vote-records.jsonl`, refusing unless the
 * record is PR-bound, self-hash-verified and approved, and unless the committed
 * ledger verifies before AND after the append. The concurrency test at the end
 * runs real `git` in a throwaway repo — `merge=union` is the acceptance
 * criterion the issue says must be tested, not assumed.
 *
 * No mocks: real files, real git, the real record builder.
 *
 * @module scripts/append-ratification-record.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConsensusResult, Vote } from '../packages/nexus-agents/src/consensus/types.js';
import type { AgentVoteResult, VoterRole } from '../packages/nexus-agents/src/cli/vote-types.js';
import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  VOTE_RECORD_SIGNATURE_NAMESPACE,
  computeVoteRecordHash,
  verifyVoteRecordSet,
} from '../packages/nexus-agents/src/audit/vote-record.js';
import { verifyVoteRecordSignature } from '../packages/nexus-agents/src/audit/vote-record-signature.js';
import {
  buildVoteRecord,
  parseVoteRecordsText,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';
import type { JobResult } from '../packages/nexus-agents/src/mcp/jobs/job-result-store.js';

import {
  appendRatificationRecord,
  parseAppendArgs,
  recordIdFromJobResult,
  type AppendOutcome,
} from './append-ratification-record.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'append-ratification-record.ts');
const HEAD = '0123456789abcdef0123456789abcdef01234567';

// ---------------------------------------------------------------------------
// Fixtures: real records from the real builder, written to a temp source store.
// ---------------------------------------------------------------------------

function vote(decision: Vote['decision']): Vote {
  return { decision, confidence: 0.8, reasoning: 'because' };
}
function agentVote(role: VoterRole, decision: Vote['decision']): AgentVoteResult {
  return { role, vote: vote(decision), processingTimeMs: 10, source: 'llm' };
}
function consensusResult(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  const now = '2026-09-14T00:00:00.000Z';
  return {
    proposalId: 'p-1',
    proposal: { title: 'T', description: 'D', algorithm: 'supermajority' },
    outcome: 'approved',
    votes: new Map(),
    voteCounts: { approve: 3, reject: 0, abstain: 0, total: 3 },
    approvalPercentage: 100,
    quorumReached: true,
    startedAt: now,
    closedAt: now,
    durationMs: 5,
    ...overrides,
  };
}
const votes: readonly AgentVoteResult[] = [
  agentVote('architect', 'approve'),
  agentVote('security', 'approve'),
  agentVote('scope_steward', 'approve'),
];

interface RecordOpts {
  readonly sequence: number;
  readonly bound?: boolean;
  readonly decision?: VoteRecord['decision'];
  readonly pr?: number;
}

/** A realistic runtime-store record: high sequence, PR-bound, approved. */
function sourceRecord(id: string, opts: RecordOpts): VoteRecord {
  return buildVoteRecord({
    declaredOptions: undefined,
    resolvedDecision: opts.decision ?? 'approved',
    id,
    proposal: `Ratify PR #${String(opts.pr ?? 6200)}`,
    strategy: 'supermajority',
    result: consensusResult(),
    votes,
    sequence: opts.sequence,
    correlationId: `consensus-${id}`,
    ...(opts.bound === false ? {} : { ratifiesPr: { pr: opts.pr ?? 6200, headSha: HEAD } }),
  });
}

function writeLedger(path: string, records: readonly VoteRecord[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, records.map((r) => JSON.stringify(r) + '\n').join(''), 'utf-8');
}

function readLedger(path: string): VoteRecord[] {
  const { records, invalidLines } = parseVoteRecordsText(readFileSync(path, 'utf-8'));
  expect(invalidLines).toEqual([]);
  return records;
}

/** The fields the committed copy must carry verbatim from the source. */
function contentOf(r: VoteRecord): Omit<VoteRecord, 'hash' | 'sequence' | 'previousHash'> {
  const { hash: _h, sequence: _s, previousHash: _p, ...content } = r;
  return content;
}

function expectRefused(outcome: AppendOutcome, reason: string): string {
  expect(outcome.kind).toBe('refused');
  if (outcome.kind !== 'refused') throw new Error('unreachable');
  expect(outcome.reason).toBe(reason);
  return outcome.detail;
}

describe('appendRatificationRecord', () => {
  let dir: string;
  let sourcePath: string;
  let ledgerPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'append-ratification-'));
    sourcePath = join(dir, '.nexus-agents', 'governance', 'vote-records.jsonl');
    ledgerPath = join(dir, 'governance', 'vote-records.jsonl');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('EMPTY committed ledger → the record becomes sequence 0 with no previousHash (the first record)', () => {
    const source = sourceRecord('vote-a', { sequence: 311 });
    writeLedger(sourcePath, [sourceRecord('vote-other', { sequence: 310 }), source]);
    writeLedger(ledgerPath, []);

    const outcome = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' });
    expect(outcome.kind).toBe('appended');
    if (outcome.kind !== 'appended') throw new Error('unreachable');
    expect(outcome.first).toBe(true);
    expect(outcome.record.sequence).toBe(0);
    expect('previousHash' in outcome.record).toBe(false);

    const committed = readLedger(ledgerPath);
    expect(committed).toHaveLength(1);
    // Content is verbatim; only the ledger-local fields moved.
    expect(contentOf(committed[0]!)).toEqual(contentOf(source));
    expect(committed[0]!.id).toBe('vote-a');
    // Re-sequencing recomputes the self-hash — `sequence` is hash-covered by
    // design (#3927) — and the committed copy verifies on its own.
    expect(committed[0]!.hash).not.toBe(source.hash);
    expect(committed[0]!.hash).toBe(computeVoteRecordHash(committed[0]!));
    expect(verifyVoteRecordSet(committed)).toEqual({ ok: true, recordCount: 1 });
  });

  it('missing committed ledger file is the same empty case, and the directory is created', () => {
    writeLedger(sourcePath, [sourceRecord('vote-a', { sequence: 0 })]);
    expect(existsSync(ledgerPath)).toBe(false);
    const outcome = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' });
    expect(outcome.kind).toBe('appended');
    expect(readLedger(ledgerPath)).toHaveLength(1);
  });

  it('NON-EMPTY committed ledger → sequence max+1, previousHash = last line, earlier bytes untouched', () => {
    const existing = [
      sourceRecord('vote-c0', { sequence: 0, pr: 6100 }),
      sourceRecord('vote-c1', { sequence: 1, pr: 6101 }),
    ];
    writeLedger(ledgerPath, existing);
    const before = readFileSync(ledgerPath, 'utf-8');
    writeLedger(sourcePath, [sourceRecord('vote-a', { sequence: 42 })]);

    const outcome = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' });
    expect(outcome.kind).toBe('appended');
    if (outcome.kind !== 'appended') throw new Error('unreachable');
    expect(outcome.first).toBe(false);
    expect(outcome.record.sequence).toBe(2);
    expect(outcome.record.previousHash).toBe(existing[1]!.hash);

    const after = readFileSync(ledgerPath, 'utf-8');
    expect(after.startsWith(before)).toBe(true);
    const committed = readLedger(ledgerPath);
    expect(committed.map((r) => r.id)).toEqual(['vote-c0', 'vote-c1', 'vote-a']);
    expect(verifyVoteRecordSet(committed)).toEqual({ ok: true, recordCount: 3 });
  });

  it('a committed ledger whose last line lacks a trailing newline still gets a SEPARATE line', () => {
    const existing = sourceRecord('vote-c0', { sequence: 0, pr: 6100 });
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, JSON.stringify(existing), 'utf-8'); // no '\n'
    writeLedger(sourcePath, [sourceRecord('vote-a', { sequence: 5 })]);

    const outcome = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' });
    expect(outcome.kind).toBe('appended');
    const committed = readLedger(ledgerPath);
    expect(committed.map((r) => r.id)).toEqual(['vote-c0', 'vote-a']);
  });

  it('REFUSES when the runtime store is missing, naming the path', () => {
    writeLedger(ledgerPath, []);
    const outcome = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' });
    const detail = expectRefused(outcome, 'source-missing');
    expect(detail).toContain(sourcePath);
    expect(readFileSync(ledgerPath, 'utf-8')).toBe('');
  });

  it('REFUSES when the record id is not in the runtime store', () => {
    writeLedger(sourcePath, [sourceRecord('vote-b', { sequence: 0 })]);
    const detail = expectRefused(
      appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' }),
      'record-not-found'
    );
    expect(detail).toContain('vote-a');
    expect(detail).toContain(sourcePath);
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it('REFUSES a record with no ratifiesPr binding — an unbound vote is not a ratification', () => {
    writeLedger(sourcePath, [sourceRecord('vote-a', { sequence: 0, bound: false })]);
    expectRefused(
      appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' }),
      'not-bound'
    );
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it.each(['rejected', 'no_quorum'] as const)('REFUSES a %s record', (decision) => {
    writeLedger(sourcePath, [sourceRecord('vote-a', { sequence: 0, decision })]);
    const detail = expectRefused(
      appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' }),
      'not-approved'
    );
    expect(detail).toContain(decision);
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it('REFUSES a source record whose own hash does not verify — an edited head sha never reaches the ledger', () => {
    const genuine = sourceRecord('vote-a', { sequence: 0 });
    // The operator's copy was edited to point at a later push, hash untouched.
    const edited: VoteRecord = {
      ...genuine,
      ratifiesPr: { pr: 6200, headSha: 'f'.repeat(40) },
    };
    writeLedger(sourcePath, [edited]);
    const detail = expectRefused(
      appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' }),
      'source-hash-mismatch'
    );
    expect(detail).toContain('vote-a');
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it('REFUSES a source record whose reasoning was edited without re-committing — the self-hash cannot see the text on the digest tier (#6263)', () => {
    const genuine = sourceRecord('vote-a', { sequence: 0 });
    expect(genuine.version).toBe('1.13');
    // The operator's copy had one voter's grounds rewritten. On 1.13 the
    // record hash folds a salted digest of the text, not the text, so the
    // self-hash still matches — the digest is what no longer opens.
    const [first, ...rest] = genuine.voters;
    const edited: VoteRecord = {
      ...genuine,
      voters: [{ ...first!, reasoning: 'rewritten grounds' }, ...rest],
    };
    expect(computeVoteRecordHash(edited)).toBe(genuine.hash);
    writeLedger(sourcePath, [edited]);
    const detail = expectRefused(
      appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' }),
      'source-hash-mismatch'
    );
    expect(detail).toContain('reasoningDigest');
    expect(detail).toContain('architect');
    // Refused BEFORE the write, not flagged by the read-back after it.
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it('DISCLOSED LIMIT: a source record edited AND re-hashed IS appended — the path trusts the operator store; provenance is step 2 or signing (#3927 item 4)', () => {
    // The pair of the test above. Anyone with the exported hash function can
    // edit the operator's copy and recompute; the self-hash check cannot tell
    // that from a genuine record. This asserts the CURRENT behaviour so that
    // signing (#3927 item 4) or the step-2 sidecar cross-check has a RED test
    // to flip, rather than a silent change of guarantee.
    const genuine = sourceRecord('vote-a', { sequence: 0 });
    const { hash: _stale, ...payload } = genuine;
    const editedPayload = { ...payload, ratifiesPr: { pr: 6200, headSha: 'f'.repeat(40) } };
    const rehashed: VoteRecord = { ...editedPayload, hash: computeVoteRecordHash(editedPayload) };
    writeLedger(sourcePath, [rehashed]);

    const outcome = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' });
    expect(outcome.kind).toBe('appended');
    expect(readLedger(ledgerPath)[0]?.ratifiesPr?.headSha).toBe('f'.repeat(40));
  });

  it('REFUSES to append onto a committed ledger that fails verification, leaving its bytes untouched', () => {
    const c0 = sourceRecord('vote-c0', { sequence: 0, pr: 6100 });
    const tampered: VoteRecord = { ...c0, approvalPercentage: 57 }; // hash now stale
    writeLedger(ledgerPath, [tampered]);
    const before = readFileSync(ledgerPath, 'utf-8');
    writeLedger(sourcePath, [sourceRecord('vote-a', { sequence: 1 })]);

    const detail = expectRefused(
      appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' }),
      'ledger-invalid'
    );
    expect(detail).toContain('hash_mismatch');
    expect(readFileSync(ledgerPath, 'utf-8')).toBe(before);
  });

  it('REFUSES to append onto a committed ledger with an unparseable line', () => {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, '# not a record\n', 'utf-8');
    writeLedger(sourcePath, [sourceRecord('vote-a', { sequence: 0 })]);
    const detail = expectRefused(
      appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' }),
      'ledger-invalid'
    );
    expect(detail).toContain('line');
    expect(readFileSync(ledgerPath, 'utf-8')).toBe('# not a record\n');
  });

  it('is idempotent: a record already in the committed ledger is reported, not appended twice', () => {
    writeLedger(sourcePath, [sourceRecord('vote-a', { sequence: 7 })]);
    const first = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' });
    expect(first.kind).toBe('appended');
    const second = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-a' });
    expect(second.kind).toBe('already-present');
    expect(readLedger(ledgerPath)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 (#3927 item 4): the committed copy is signed over its COMMITTED hash.
// Real ssh-keygen, ephemeral ed25519 keys, an allowed_signers next to the ledger.
// ---------------------------------------------------------------------------

describe('signing the committed record (#3927 item 4, phase 2)', () => {
  const OPERATOR = 'operator@test';
  let dir: string;
  let sourcePath: string;
  let ledgerPath: string;
  let allowedSignersPath: string;
  let keyPath: string;
  let strangerKeyPath: string;

  function keygen(path: string): void {
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'ephemeral', '-f', path], {
      stdio: 'ignore',
    });
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'append-ratification-signed-'));
    sourcePath = join(dir, '.nexus-agents', 'governance', 'vote-records.jsonl');
    ledgerPath = join(dir, 'governance', 'vote-records.jsonl');
    allowedSignersPath = join(dir, 'governance', 'allowed_signers');
    keyPath = join(dir, 'operator_key');
    strangerKeyPath = join(dir, 'stranger_key');
    keygen(keyPath);
    keygen(strangerKeyPath);
    mkdirSync(dirname(allowedSignersPath), { recursive: true });
    writeFileSync(
      allowedSignersPath,
      `${OPERATOR} namespaces="${VOTE_RECORD_SIGNATURE_NAMESPACE}",valid-after="20200101" ${readFileSync(`${keyPath}.pub`, 'utf-8')}`,
      'utf-8'
    );
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function allowedSigners(): string {
    return readFileSync(allowedSignersPath, 'utf-8');
  }

  it('ROUND TRIP: the signature is over the COMMITTED hash (re-sequenced, re-hashed), not the source hash', () => {
    // Source at sequence 311; committed lands at 0, so the two hashes differ
    // and only one of them is what the ledger carries.
    writeLedger(sourcePath, [sourceRecord('vote-s', { sequence: 311 })]);
    const outcome = appendRatificationRecord({
      sourcePath,
      ledgerPath,
      recordId: 'vote-s',
      signing: { keyPath, allowedSignersPath },
    });
    expect(outcome.kind).toBe('appended');
    if (outcome.kind !== 'appended') throw new Error('unreachable');
    expect(outcome.signing).toBe('signed');
    expect(outcome.record.hash).not.toBe(outcome.sourceRecord.hash);

    // Measured on the bytes on disk, through the real verifier.
    const [committed] = readLedger(ledgerPath);
    if (committed === undefined) throw new Error('nothing on disk');
    expect(committed.signature?.keyId).toBe(OPERATOR);
    expect(committed.signature?.namespace).toBe(VOTE_RECORD_SIGNATURE_NAMESPACE);
    expect(
      verifyVoteRecordSignature({ record: committed, allowedSigners: allowedSigners() })
    ).toEqual({ code: 'signed', keyId: OPERATOR });

    // The same signature transplanted onto the SOURCE hash does not verify:
    // a script that signed before re-sequencing would produce exactly this.
    const overSourceHash: VoteRecord = {
      ...outcome.sourceRecord,
      signature: committed.signature,
    };
    expect(
      verifyVoteRecordSignature({ record: overSourceHash, allowedSigners: allowedSigners() }).code
    ).toBe('bad-signature');

    // The set still verifies, and the source store was not touched.
    expect(verifyVoteRecordSet(readLedger(ledgerPath)).ok).toBe(true);
    expect(readLedger(sourcePath)[0]?.signature).toBeUndefined();
  });

  it('a second signed append lands at sequence 1 with its own signature over its own hash', () => {
    writeLedger(sourcePath, [
      sourceRecord('vote-s0', { sequence: 5, pr: 6100 }),
      sourceRecord('vote-s1', { sequence: 6, pr: 6200 }),
    ]);
    const signing = { keyPath, allowedSignersPath };
    expect(
      appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-s0', signing }).kind
    ).toBe('appended');
    expect(
      appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-s1', signing }).kind
    ).toBe('appended');
    const records = readLedger(ledgerPath);
    expect(records.map((r) => r.sequence)).toEqual([0, 1]);
    for (const r of records) {
      expect(verifyVoteRecordSignature({ record: r, allowedSigners: allowedSigners() })).toEqual({
        code: 'signed',
        keyId: OPERATOR,
      });
    }
    expect(records[0]?.signature?.sig).not.toBe(records[1]?.signature?.sig);
  });

  it('no signing configured → appended UNSIGNED, and the outcome says so (phase 2 is opt-in until phase 3)', () => {
    writeLedger(sourcePath, [sourceRecord('vote-u', { sequence: 0 })]);
    const outcome = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-u' });
    expect(outcome.kind).toBe('appended');
    if (outcome.kind !== 'appended') throw new Error('unreachable');
    expect(outcome.signing).toBe('unsigned-no-key');
    expect(readLedger(ledgerPath)[0]?.signature).toBeUndefined();
    expect(
      verifyVoteRecordSignature({ record: outcome.record, allowedSigners: allowedSigners() })
    ).toEqual({ code: 'unsigned-record' });
  });

  it('a stale signature on the SOURCE copy is dropped, never carried: it could only be over the source hash', () => {
    const source = sourceRecord('vote-stale', { sequence: 9 });
    const stale: VoteRecord = {
      ...source,
      signature: {
        keyId: OPERATOR,
        namespace: VOTE_RECORD_SIGNATURE_NAMESPACE,
        sig: '-----BEGIN SSH SIGNATURE-----\nU1NIU0lHTEST\n-----END SSH SIGNATURE-----\n',
      },
    };
    writeLedger(sourcePath, [stale]);
    const outcome = appendRatificationRecord({ sourcePath, ledgerPath, recordId: 'vote-stale' });
    expect(outcome.kind).toBe('appended');
    expect(readLedger(ledgerPath)[0]?.signature).toBeUndefined();
  });

  it('REFUSES (signing-failed) when the key is not an allowed signer — nothing is written', () => {
    writeLedger(sourcePath, [sourceRecord('vote-x', { sequence: 0 })]);
    const outcome = appendRatificationRecord({
      sourcePath,
      ledgerPath,
      recordId: 'vote-x',
      signing: { keyPath: strangerKeyPath, allowedSignersPath },
    });
    const detail = expectRefused(outcome, 'signing-failed');
    expect(detail).toContain('not an allowed signer');
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it('REFUSES (signing-failed) when the key path or the allowed_signers path cannot be read — nothing is written', () => {
    writeLedger(sourcePath, [sourceRecord('vote-x', { sequence: 0 })]);
    const noKey = appendRatificationRecord({
      sourcePath,
      ledgerPath,
      recordId: 'vote-x',
      signing: { keyPath: join(dir, 'no-such-key'), allowedSignersPath },
    });
    expect(expectRefused(noKey, 'signing-failed')).toContain('ssh-keygen -Y sign');

    const noSigners = appendRatificationRecord({
      sourcePath,
      ledgerPath,
      recordId: 'vote-x',
      signing: { keyPath, allowedSignersPath: join(dir, 'no-such-signers') },
    });
    expect(expectRefused(noSigners, 'signing-failed')).toContain('no-such-signers');
    expect(existsSync(ledgerPath)).toBe(false);
  });

  describe('CLI: --signing-key, NEXUS_VOTE_SIGNING_KEY, or neither', () => {
    function run(
      args: readonly string[],
      env: Record<string, string> = {}
    ): { status: number; output: string } {
      const base = { ...process.env };
      delete base['NEXUS_VOTE_SIGNING_KEY'];
      try {
        const output = execFileSync('pnpm', ['exec', 'tsx', SCRIPT, ...args], {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
          env: { ...base, ...env },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { status: 0, output };
      } catch (error: unknown) {
        const e = error as { status: number | null; stdout: string; stderr: string };
        return { status: e.status ?? -1, output: `${e.stdout}${e.stderr}` };
      }
    }

    it('--signing-key signs; the notice names the signer and never the key material', () => {
      writeLedger(sourcePath, [sourceRecord('vote-cli-s', { sequence: 3 })]);
      const r = run([
        '--record-id',
        'vote-cli-s',
        '--source',
        sourcePath,
        '--ledger',
        ledgerPath,
        '--signing-key',
        keyPath,
      ]);
      expect(r.status).toBe(0);
      expect(r.output).toContain(`signed by ${OPERATOR}`);
      expect(r.output).not.toContain('PRIVATE KEY');
      expect(r.output).not.toContain(readFileSync(keyPath, 'utf-8').split('\n')[1] ?? '\0');
      const [committed] = readLedger(ledgerPath);
      if (committed === undefined) throw new Error('nothing on disk');
      expect(
        verifyVoteRecordSignature({ record: committed, allowedSigners: allowedSigners() }).code
      ).toBe('signed');
    }, 60_000);

    it('NEXUS_VOTE_SIGNING_KEY signs when no flag is passed', () => {
      writeLedger(sourcePath, [sourceRecord('vote-cli-e', { sequence: 3 })]);
      const r = run(['--record-id', 'vote-cli-e', '--source', sourcePath, '--ledger', ledgerPath], {
        NEXUS_VOTE_SIGNING_KEY: keyPath,
      });
      expect(r.status).toBe(0);
      expect(r.output).toContain(`signed by ${OPERATOR}`);
      expect(readLedger(ledgerPath)[0]?.signature?.keyId).toBe(OPERATOR);
    }, 60_000);

    it('neither → appended UNSIGNED with a one-line notice naming the flag and the variable', () => {
      writeLedger(sourcePath, [sourceRecord('vote-cli-u', { sequence: 3 })]);
      const r = run(['--record-id', 'vote-cli-u', '--source', sourcePath, '--ledger', ledgerPath]);
      expect(r.status).toBe(0);
      expect(r.output).toContain('UNSIGNED');
      expect(r.output).toContain('--signing-key');
      expect(r.output).toContain('NEXUS_VOTE_SIGNING_KEY');
      expect(readLedger(ledgerPath)[0]?.signature).toBeUndefined();
    }, 60_000);

    it('a configured key that cannot sign exits 1 with signing-failed and writes nothing', () => {
      writeLedger(sourcePath, [sourceRecord('vote-cli-f', { sequence: 3 })]);
      const r = run([
        '--record-id',
        'vote-cli-f',
        '--source',
        sourcePath,
        '--ledger',
        ledgerPath,
        '--signing-key',
        strangerKeyPath,
      ]);
      expect(r.status).toBe(1);
      expect(r.output).toContain('signing-failed');
      expect(existsSync(ledgerPath)).toBe(false);
    }, 60_000);
  });
});

describe('recordIdFromJobResult (--job)', () => {
  const base: JobResult = {
    v: 1,
    jobId: 'job-consensus_vote-abc',
    toolName: 'consensus_vote',
    status: 'complete',
    createdAt: '2026-09-14T00:00:00.000Z',
    completedAt: '2026-09-14T00:01:00.000Z',
  };

  it('reads voteRecordId from a complete consensus_vote job', () => {
    const job: JobResult = { ...base, result: { ok: true, value: { voteRecordId: 'vote-xyz' } } };
    expect(recordIdFromJobResult(job, 'job-consensus_vote-abc')).toEqual({
      ok: true,
      recordId: 'vote-xyz',
    });
  });

  it('names an unknown job (null result) rather than defaulting', () => {
    const r = recordIdFromJobResult(null, 'job-nope');
    expect(r).toMatchObject({ ok: false, reason: 'job-not-found' });
    if (!r.ok) expect(r.detail).toContain('job-nope');
  });

  it.each(['pending', 'failed', 'cancelled'] as const)('refuses a %s job', (status) => {
    const r = recordIdFromJobResult({ ...base, status }, base.jobId);
    expect(r).toMatchObject({ ok: false, reason: 'job-not-complete' });
    if (!r.ok) expect(r.detail).toContain(status);
  });

  it('refuses a job from another tool', () => {
    const r = recordIdFromJobResult(
      { ...base, toolName: 'orchestrate', result: { ok: true, value: { voteRecordId: 'x' } } },
      base.jobId
    );
    expect(r).toMatchObject({ ok: false, reason: 'job-not-consensus-vote' });
  });

  it('refuses a complete job whose result carries no voteRecordId, and says why that happens', () => {
    // A job produced before #5130 step 1, or one whose persist failed.
    const r = recordIdFromJobResult(
      { ...base, result: { ok: true, value: { voteRecordPersisted: false } } },
      base.jobId
    );
    expect(r).toMatchObject({ ok: false, reason: 'job-without-record-id' });
    if (!r.ok) expect(r.detail).toContain('--record-id');
  });
});

describe('parseAppendArgs', () => {
  it('accepts exactly one of --job / --record-id', () => {
    expect(parseAppendArgs(['--record-id', 'vote-1'])).toEqual({
      ok: true,
      selector: { recordId: 'vote-1' },
    });
    expect(parseAppendArgs(['--job', 'job-1', '--ledger', '/l', '--source', '/s'])).toEqual({
      ok: true,
      selector: { jobId: 'job-1' },
      ledgerPath: '/l',
      sourcePath: '/s',
    });
    expect(parseAppendArgs([]).ok).toBe(false);
    expect(parseAppendArgs(['--job', 'j', '--record-id', 'r']).ok).toBe(false);
    expect(parseAppendArgs(['--record-id']).ok).toBe(false);
    expect(parseAppendArgs(['--record-id', 'r', '--bogus']).ok).toBe(false);
  });

  it('accepts --signing-key with a value (#3927 item 4, phase 2)', () => {
    expect(parseAppendArgs(['--record-id', 'r', '--signing-key', '/k'])).toEqual({
      ok: true,
      selector: { recordId: 'r' },
      signingKeyPath: '/k',
    });
    expect(parseAppendArgs(['--record-id', 'r', '--signing-key']).ok).toBe(false);
  });
});

describe('CLI', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'append-ratification-cli-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(args: readonly string[]): { status: number; stdout: string } {
    try {
      const stdout = execFileSync('pnpm', ['exec', 'tsx', SCRIPT, ...args], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, stdout };
    } catch (error: unknown) {
      const e = error as { status: number | null; stdout: string; stderr: string };
      return { status: e.status ?? -1, stdout: `${e.stdout}${e.stderr}` };
    }
  }

  it('appends by --record-id with explicit --source/--ledger and exits 0; a refusal exits 1', () => {
    const sourcePath = join(dir, 'src.jsonl');
    const ledgerPath = join(dir, 'gov', 'vote-records.jsonl');
    writeLedger(sourcePath, [sourceRecord('vote-cli', { sequence: 3 })]);

    const ok = run(['--record-id', 'vote-cli', '--source', sourcePath, '--ledger', ledgerPath]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('vote-cli');
    expect(readLedger(ledgerPath)).toHaveLength(1);

    const refused = run([
      '--record-id',
      'vote-missing',
      '--source',
      sourcePath,
      '--ledger',
      ledgerPath,
    ]);
    expect(refused.status).toBe(1);
    expect(refused.stdout).toContain('record-not-found');
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Concurrency: two branches, one committed ledger, `merge=union` — real git.
// ---------------------------------------------------------------------------

describe('two branches appending concurrently merge under merge=union (real git)', () => {
  let dir: string;
  let repo: string;
  const ledgerRel = 'governance/vote-records.jsonl';

  function git(args: readonly string[]): string {
    return execFileSync('git', [...args], {
      cwd: repo,
      encoding: 'utf-8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@example.invalid',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@example.invalid',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'append-ratification-git-'));
    repo = join(dir, 'repo');
    mkdirSync(join(repo, 'governance'), { recursive: true });
    // The attribute exactly as the real repo declares it (.gitattributes).
    writeFileSync(join(repo, '.gitattributes'), `${ledgerRel} merge=union\n`, 'utf-8');
    git(['init', '-q', '-b', 'main']);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function appendOnBranch(branch: string, from: string, recordId: string, seq: number): void {
    git(['checkout', '-q', '-b', branch, from]);
    const sourcePath = join(dir, `store-${branch}.jsonl`);
    writeLedger(sourcePath, [sourceRecord(recordId, { sequence: seq, pr: seq + 6000 })]);
    const outcome = appendRatificationRecord({
      sourcePath,
      ledgerPath: join(repo, ledgerRel),
      recordId,
    });
    expect(outcome.kind).toBe('appended');
    git(['add', '-A']);
    git(['commit', '-q', '-m', `append ${recordId}`]);
  }

  it.each([
    { name: 'from an EMPTY ledger', base: [] as VoteRecord[], expectedFork: 0, expectedCount: 2 },
    {
      name: 'from a ledger with one record',
      base: [sourceRecord('vote-base', { sequence: 0, pr: 6000 })],
      expectedFork: 1,
      expectedCount: 3,
    },
  ])('$name: both lines survive, no conflict, the set verifies with the fork surfaced', (c) => {
    writeLedger(join(repo, ledgerRel), c.base);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);

    appendOnBranch('pr-a', 'main', 'vote-from-a', 11);
    appendOnBranch('pr-b', 'main', 'vote-from-b', 12);

    // Merge B into A. A conflict would throw (non-zero exit).
    git(['checkout', '-q', 'pr-a']);
    git(['merge', '--no-edit', '-q', 'pr-b']);
    expect(git(['status', '--porcelain']).trim()).toBe('');

    const merged = readLedger(join(repo, ledgerRel));
    expect(merged).toHaveLength(c.expectedCount);
    expect(merged.map((r) => r.id)).toEqual(expect.arrayContaining(['vote-from-a', 'vote-from-b']));
    const verdict = verifyVoteRecordSet(merged);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.recordCount).toBe(c.expectedCount);
      // Both branches computed the same next sequence: the benign fork signal.
      expect(verdict.forks).toEqual([c.expectedFork]);
    }
    // And the appender still accepts the merged ledger as a base for the next record.
    const sourcePath = join(dir, 'store-after.jsonl');
    writeLedger(sourcePath, [sourceRecord('vote-after', { sequence: 99, pr: 6099 })]);
    const next = appendRatificationRecord({
      sourcePath,
      ledgerPath: join(repo, ledgerRel),
      recordId: 'vote-after',
    });
    expect(next.kind).toBe('appended');
    if (next.kind === 'appended') expect(next.record.sequence).toBe(c.expectedFork + 1);
  });
});
