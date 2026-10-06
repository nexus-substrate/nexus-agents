/** Parser-to-ledger conditions fidelity and bounds (#7134). */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IModelAdapter, ILogger } from '../core/index.js';
import type { ConsensusResult, Vote } from '../consensus/types.js';
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

  it('distinguishes absent conditions from an explicitly empty array', () => {
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
    expect(computeVoteRecordHash({ ...empty, voters: [voter] })).not.toBe(empty.hash);
  });

  it('detects tampering with a condition as a hash mismatch', () => {
    const record = persistVoteRecord({ ...inputFor(['Add tests']), filePath });
    if (record === undefined) throw new Error('Expected a persisted conditions record');
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
    const tampered = { ...record, voters: [{ ...record.voters[0]!, conditions: ['Skip tests'] }] };
    expect(VoteRecordSchema.safeParse(tampered).success).toBe(true);
    expect(verifyVoteRecordSet([tampered])).toMatchObject({ ok: false, reason: 'hash_mismatch' });
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
    ['count', Array.from({ length: 21 }, () => 'condition')],
    ['length', ['x'.repeat(2_001)]],
  ])('fails closed on an excessive %s, without truncating or appending', (_bound, conditions) => {
    const existing = persistVoteRecord({ ...inputFor(), filePath });
    const input = inputFor(conditions);
    const record = buildVoteRecord(input);
    expect(record.voters[0]).toHaveProperty('conditions', conditions);
    expect(VoteRecordSchema.safeParse(record).success).toBe(false);
    expect(persistVoteRecord({ ...input, filePath })).toBeUndefined();
    expect(LOGGER.warn).toHaveBeenCalledWith(
      'Failed to persist authentic vote record',
      expect.any(Object)
    );
    expect(readVoteRecords(filePath).records).toEqual([existing]);
  });

  it('retains strict voter validation and rejects non-string conditions', () => {
    const voter = { role: 'architect', decision: 'approve', confidence: 0.9 };
    expect(VoterSummarySchema.safeParse({ ...voter, conditions: [42] }).success).toBe(false);
    expect(VoterSummarySchema.safeParse({ ...voter, conditions: [], invented: true }).success).toBe(
      false
    );
  });
});
