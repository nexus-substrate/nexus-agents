/** Parser-to-ledger conditions fidelity and bounds (#7134). */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IModelAdapter, ILogger } from '../core/index.js';
import type { ConsensusResult, Vote } from '../consensus/types.js';
import {
  buildRedactionRecord,
  redactVoterOpenings,
  findRedactionDefect,
} from './redaction-record.js';
import { computeReasoningDigest } from './reasoning-commitment.js';
import { parseVoteResponse } from '../cli/voter-response.js';
import { buildLlmVoteResult } from '../cli/voter-attempt-usage.js';
import {
  buildVoteRecord,
  persistVoteRecord,
  readVoteRecords,
  type BuildVoteRecordInput,
} from './vote-record-store.js';
import {
  computeVoteRecordHash,
  VoteRecordSchema,
  VoterSummarySchema,
  verifyVoteRecordSet,
  type VoteRecord,
} from './vote-record.js';

const ADAPTER: IModelAdapter = {
  providerId: 'test',
  modelId: 'test-model',
  capabilities: [],
  complete: vi.fn(),
  stream: vi.fn(),
  countTokens: vi.fn(),
  validateConfig: vi.fn(),
};
const LOGGER: ILogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
  setLevel: vi.fn(),
};
const RESULT: ConsensusResult = {
  proposalId: 'conditions',
  proposal: { title: 'T', description: 'D', algorithm: 'simple_majority' },
  outcome: 'approved',
  votes: new Map(),
  voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
  approvalPercentage: 100,
  quorumReached: true,
  startedAt: '2026-10-06T00:00:00.000Z',
  closedAt: '2026-10-06T00:00:00.000Z',
  durationMs: 1,
};

/** Exercise the actual parser and successful-seat builder, without a CLI subprocess. */
function inputFor(
  conditions?: string[],
  decision: Vote['decision'] = 'approve'
): BuildVoteRecordInput {
  const vote = parseVoteResponse(
    JSON.stringify({
      decision,
      confidence: 0.9,
      reasoning: 'The artifact supports this decision.',
      ...(conditions !== undefined ? { conditions } : {}),
    }),
    'architect'
  );
  const seat = buildLlmVoteResult(
    'architect',
    {
      vote,
      usage: {},
      cliStderr: undefined,
      fallbackFrom: undefined,
      servedModel: undefined,
      attemptUsage: { completions: 1, reportedCompletions: 0 },
    },
    ADAPTER,
    1
  );
  return {
    id: 'conditions',
    proposal: 'Record advisory conditions',
    strategy: 'simple_majority',
    result: RESULT,
    votes: [seat],
    recordedAt: RESULT.closedAt,
    logger: LOGGER,
    declaredOptions: undefined,
    resolvedDecision: undefined,
  };
}

describe('vote record conditions (#7134)', () => {
  let directory: string;
  let filePath: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'vote-conditions-'));
    filePath = join(directory, 'votes.jsonl');
    vi.clearAllMocks();
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('round-trips exactly what the voter sent through the parser, seat, and ledger', () => {
    const conditions = ['Add regression tests.', 'Document café support.\nKeep the Unicode: ✓'];
    const record = persistVoteRecord({ ...inputFor(conditions), filePath });
    expect(record).toMatchObject({
      version: '1.15',
      voters: [{ conditions }],
      decision: 'approved',
      voteCounts: RESULT.voteCounts,
      approvalPercentage: RESULT.approvalPercentage,
    });
    const ledger = readVoteRecords(filePath);
    expect(ledger.invalidLines).toEqual([]);
    expect(ledger.records).toEqual([record]);
    expect(verifyVoteRecordSet(ledger.records)).toEqual({ ok: true, recordCount: 1 });
  });

  it('an empty conditions array promotes the record to 1.15, unlike absent conditions', () => {
    const absent = persistVoteRecord({ ...inputFor(), filePath });
    const empty = persistVoteRecord({ ...inputFor([]), filePath });
    expect(absent?.version).toBe('1.13');
    expect(absent?.voters[0]).not.toHaveProperty('conditions');
    expect(empty).toMatchObject({ version: '1.15', voters: [{ conditions: [] }] });
    const ledger = readVoteRecords(filePath);
    expect(ledger.records[0]?.voters[0]).not.toHaveProperty('conditions');
    expect(ledger.records[1]?.voters[0]).toHaveProperty('conditions', []);
    expect(verifyVoteRecordSet(ledger.records)).toEqual({ ok: true, recordCount: 2 });
    // Hold the version, sequence, and reasoning salt fixed to isolate field presence.
    if (empty === undefined) throw new Error('Expected an empty-conditions record');
    const { conditions: _conditions, ...voter } = empty.voters[0]!;
    expect(_conditions).toEqual([]);
    // The digest commits to presence; the opening itself remains outside the hash.
    expect(computeVoteRecordHash({ ...empty, voters: [voter] })).toBe(empty.hash);
    expect(verifyVoteRecordSet([{ ...empty, voters: [voter] }])).toMatchObject({
      ok: false,
      reason: 'hash_mismatch',
    });
  });

  it('detects tampering with a condition as a hash mismatch', () => {
    const record = persistVoteRecord({ ...inputFor(['Add tests']), filePath });
    if (record === undefined) throw new Error('Expected a persisted conditions record');
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
    const tampered = { ...record, voters: [{ ...record.voters[0]!, conditions: ['Skip tests'] }] };
    expect(VoteRecordSchema.safeParse(tampered).success).toBe(true);
    expect(verifyVoteRecordSet([tampered])).toMatchObject({ ok: false, reason: 'hash_mismatch' });
  });

  it('commits reasoning and conditions under the same nonce on every seat in a 1.15 panel', () => {
    const input = inputFor(['Add tests']);
    const second = { ...inputFor().votes[0]!, role: 'security' as const };
    const record = buildVoteRecord({
      ...input,
      votes: [...input.votes, second],
      result: { ...RESULT, voteCounts: { ...RESULT.voteCounts, approve: 2, total: 2 } },
    });
    expect(record.voters).toHaveLength(2);
    expect(record.version).toBe('1.15');
    for (const voter of record.voters) {
      expect(voter.reasoningDigest).toBe(
        computeReasoningDigest(
          voter.reasoningNonce!,
          JSON.stringify({ reasoning: voter.reasoning, conditions: voter.conditions })
        )
      );
    }
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });

  it.each(['edited', 'reordered', 'removed', 'empty'] as const)(
    'detects %s conditions through the commitment while the record hash is unchanged',
    (change) => {
      const record = buildVoteRecord(inputFor(['Add tests', 'Document changes']));
      const voter = { ...record.voters[0]! };
      if (change === 'edited') voter.conditions = ['Skip tests', 'Document changes'];
      if (change === 'reordered') voter.conditions = ['Document changes', 'Add tests'];
      if (change === 'removed') delete voter.conditions;
      if (change === 'empty') voter.conditions = [];
      const tampered = { ...record, voters: [voter] };
      expect(computeVoteRecordHash(tampered)).toBe(record.hash);
      expect(verifyVoteRecordSet([tampered])).toMatchObject({ ok: false, reason: 'hash_mismatch' });
    }
  );

  it('redacts the complete 1.15 opening without changing the hash and requires a named redaction', () => {
    const record = buildVoteRecord(inputFor(['Remove TESTFAKE private context']));
    const voters = redactVoterOpenings(record.voters, new Set(['architect']), record.version);
    const redacted = { ...record, voters };
    const redaction = buildRedactionRecord({
      id: 'redaction',
      sequence: 1,
      targetId: record.id,
      targetVoterRoles: ['architect'],
      at: record.recordedAt,
      by: 'operator',
      reason: 'private context',
    });
    expect(voters[0]).not.toHaveProperty('conditions');
    expect(voters[0]).not.toHaveProperty('reasoning');
    expect(voters[0]).not.toHaveProperty('reasoningNonce');
    expect(voters[0]?.reasoningDigest).toBe(record.voters[0]?.reasoningDigest);
    expect(computeVoteRecordHash(redacted)).toBe(record.hash);
    expect(VoteRecordSchema.safeParse(redacted).success).toBe(true);
    expect(verifyVoteRecordSet([redacted])).toMatchObject({ ok: false, reason: 'hash_mismatch' });
    expect(verifyVoteRecordSet([redacted], [redaction])).toMatchObject({
      ok: true,
      redacted: [{ recordId: record.id }],
    });
    const partial = { ...record.voters[0]! };
    delete partial.reasoning;
    delete partial.reasoningNonce;
    const incomplete = { ...record, voters: [partial] };
    expect(VoteRecordSchema.safeParse(incomplete).success).toBe(false);
    expect(verifyVoteRecordSet([incomplete], [redaction])).toMatchObject({
      ok: false,
      reason: 'hash_mismatch',
    });
    expect(findRedactionDefect([redaction], [incomplete])).toMatchObject({
      reason: 'redaction_unbound',
    });
  });

  it('verifies a pre-change 1.14 record with its exact original hash', () => {
    // Captured on origin/main before adding the conditions schema or projection.
    const record: VoteRecord = {
      version: '1.14',
      id: 'legacy-conditions',
      sequence: 0,
      recordedAt: '2026-10-06T00:00:00.000Z',
      proposalHash: 'a'.repeat(64),
      proposal: 'Legacy approval',
      strategy: 'simple_majority',
      decision: 'approved',
      approvalPercentage: 100,
      voteCounts: RESULT.voteCounts,
      voters: [
        {
          role: 'architect',
          decision: 'approve',
          confidence: 0.9,
          reasoning: 'Approved with evidence',
          reasoningNonce: 'b'.repeat(64),
          reasoningDigest: '34daa8c7c88785ab4f66fcdd48e4a8d6e387f54b2ff1621444bc83e48d6d103c',
          selectedOption: 'D',
          optionReask: { resolved: true },
        },
      ],
      hash: '0b91a0b338a744f0d28bd65f31968b8c929409e889d11ee5d2d05eada3ef7b9e',
    };
    expect(computeVoteRecordHash(record)).toBe(record.hash);
    expect(VoteRecordSchema.parse(record)).toEqual(record);
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
    const explicitUndefined = {
      ...record,
      voters: [{ ...record.voters[0]!, conditions: undefined }],
    };
    expect(computeVoteRecordHash(explicitUndefined)).toBe(record.hash);
  });

  it.each(['reject', 'abstain'] as const)('preserves conditions sent alongside %s', (decision) => {
    expect(buildVoteRecord(inputFor(['Investigate further'], decision)).voters[0]).toMatchObject({
      decision,
      conditions: ['Investigate further'],
    });
  });

  it('accepts the exact count and length limits without clipping', () => {
    // Schema contract: at most 20 conditions, each at most 2,000 UTF-16 code units.
    const conditions = Array.from({ length: 20 }, () => 'x'.repeat(2_000));
    const record = persistVoteRecord({ ...inputFor(conditions), filePath });
    expect(record?.voters[0]).toHaveProperty('conditions', conditions);
    expect(readVoteRecords(filePath).records).toEqual([record]);
  });

  it.each([
    [
      'count',
      Array.from({ length: 23 }, (_, i) => `condition ${String(i)}`),
      [
        ...Array.from({ length: 19 }, (_, i) => `condition ${String(i)}`),
        ' …[truncated] 4 conditions dropped',
      ],
    ],
    ['length', ['x'.repeat(2_001)], ['x'.repeat(2_000 - ' …[truncated]'.length) + ' …[truncated]']],
  ])(
    'persists an over-cap %s response with visibly clamped conditions',
    (_bound, conditions, expected) => {
      // Previously this test pinned loss of the whole record while the vote counted.
      const existing = persistVoteRecord({ ...inputFor(), filePath });
      const input = inputFor(conditions);
      expect(input.votes[0]?.vote.conditions).toEqual(expected);
      const record = persistVoteRecord({ ...input, filePath });
      expect(record).toMatchObject({
        version: '1.15',
        voters: [{ conditions: expected }],
        decision: 'approved',
        voteCounts: RESULT.voteCounts,
      });
      expect(LOGGER.warn).not.toHaveBeenCalled();
      const ledger = readVoteRecords(filePath);
      expect(ledger.records).toEqual([existing, record]);
      expect(verifyVoteRecordSet(ledger.records)).toEqual({ ok: true, recordCount: 2 });
    }
  );

  it('retains strict voter validation and rejects non-string conditions', () => {
    const voter = { role: 'architect', decision: 'approve', confidence: 0.9 };
    expect(VoterSummarySchema.safeParse({ ...voter, conditions: [42] }).success).toBe(false);
    expect(VoterSummarySchema.safeParse({ ...voter, conditions: [], invented: true }).success).toBe(
      false
    );
  });
});
