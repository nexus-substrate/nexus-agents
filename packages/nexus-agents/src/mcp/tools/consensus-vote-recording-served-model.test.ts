/**
 * The seam from a voter completion to the persisted vote record (#6967).
 *
 * The adapter reports the model it served on `CompletionResponse.model`.
 * `executeAgentVote` carries it as `AgentVoteResult.servedModel`; the vote
 * record must carry it as `voters[].servedModel`, hash-covered, so the
 * two-model-family ratification floor can withhold credit on a mismatch.
 * Each test runs the REAL voter execution and the REAL store against a temp
 * ledger, so a link dropped anywhere between them fails here.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VOTE_RECORDS_PATH_ENV, parseVoteRecordsText } from '../../audit/vote-record-store.js';
import { verifyVoteRecordSet } from '../../audit/vote-record.js';
import type { ConsensusResult } from '../../consensus/types.js';
import { executeAgentVote } from '../../cli/voter-agents.js';
import type { ILogger, IModelAdapter } from '../../core/index.js';

vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    recordTask: vi.fn(),
    recordLearning: vi.fn(),
    runPromotionPipeline: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { recordAuthenticVote } from './consensus-vote-recording.js';

const APPROVE = JSON.stringify({
  decision: 'approve',
  reasoning: 'Approve: the change is small and tested.',
  confidence: 0.9,
});

function silentLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
}

/** An adapter built for `claude-fable-5` whose completion reports `reported` as the served model. */
function adapterReporting(reported: string): IModelAdapter {
  return {
    providerId: 'cli-claude',
    modelId: 'claude-fable-5',
    capabilities: [],
    complete: vi.fn().mockResolvedValue({
      ok: true,
      value: { content: APPROVE, stopReason: 'end_turn', model: reported },
    }),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue({ ok: true }),
  };
}

function consensusResult(): ConsensusResult {
  const now = '2026-10-02T00:00:00.000Z';
  return {
    proposalId: 'p-6967',
    proposal: { title: 'T', description: 'D', algorithm: 'supermajority' },
    outcome: 'approved',
    votes: new Map(),
    voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
    approvalPercentage: 100,
    quorumReached: true,
    startedAt: now,
    closedAt: now,
    durationMs: 5,
  };
}

describe('the adapter-reported served model reaches the persisted vote record (#6967)', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'served-model-'));
    filePath = join(dir, 'governance', 'vote-records.jsonl');
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, filePath);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  /** One live-shaped seat through the real voter execution, persisted through the real store. */
  async function persistSeatReporting(reported: string): Promise<string> {
    const seat = await executeAgentVote(
      'architect',
      'Ratify',
      adapterReporting(reported),
      silentLogger(),
      { timeoutMs: 5000, maxRetries: 0 }
    );
    expect(seat.source).toBe('llm');
    const outcome = await recordAuthenticVote({
      declaredOptions: undefined,
      resolvedDecision: 'approved',
      errorPolicy: undefined,
      proposal: 'Ratify',
      strategy: 'supermajority',
      result: consensusResult(),
      votes: [seat],
    });
    expect(outcome.persisted).toBe(true);
    return readFileSync(filePath, 'utf-8');
  }

  it('writes the served model, distinct from the requested model, and the record verifies', async () => {
    const text = await persistSeatReporting('claude-sonnet');
    const { records, invalidLines } = parseVoteRecordsText(text);
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]?.voters[0]).toMatchObject({
      model: 'claude-fable-5',
      servedModel: 'claude-sonnet',
    });
    expect(verifyVoteRecordSet(records).ok).toBe(true);
  });

  it('the served model is hash-covered: tampering it on disk breaks verification', async () => {
    const text = await persistSeatReporting('claude-sonnet');
    const tampered = text.replace('"servedModel":"claude-sonnet"', '"servedModel":"gpt-5.5"');
    expect(tampered).not.toBe(text);
    const { records, invalidLines } = parseVoteRecordsText(tampered);
    expect(invalidLines).toEqual([]);
    expect(verifyVoteRecordSet(records)).toMatchObject({ ok: false, reason: 'hash_mismatch' });
  });

  it('records no servedModel when the adapter reported none — never the configured model', async () => {
    const text = await persistSeatReporting('');
    const { records } = parseVoteRecordsText(text);
    const voter = records[0]?.voters[0];
    expect(voter?.model).toBe('claude-fable-5');
    expect(voter).not.toHaveProperty('servedModel');
    expect(verifyVoteRecordSet(records).ok).toBe(true);
  });

  it('omits a reported value the reader would reject, and still persists the record', async () => {
    const text = await persistSeatReporting('claude sonnet<script>');
    const { records, invalidLines } = parseVoteRecordsText(text);
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]?.voters[0]).not.toHaveProperty('servedModel');
    expect(verifyVoteRecordSet(records).ok).toBe(true);
  });
});
