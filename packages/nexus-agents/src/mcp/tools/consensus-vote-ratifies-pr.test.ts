/**
 * Seam test for #5130 step 1: `args.ratifiesPr` must reach the persisted vote
 * record, and the record's id must reach the caller.
 *
 * Same harness as `consensus-vote-declared-options.test.ts` (#6053), for the
 * same reason: the entry hop — `consensus-vote.ts` passing `args.ratifiesPr`
 * into `recordVoteSideEffects` — is the one a fixture-only test skips, and it
 * is the one the caller-commits script depends on. `collectRealVotes` is
 * canned; everything downstream is real, with the ledger pointed at a temp
 * file via `NEXUS_VOTE_RECORDS_PATH`.
 *
 * The second block (#6211) rides the same harness for the same hop in the
 * other direction: the EFFECTIVE error policy — resolved inside
 * `executeVoting` from the input or the per-strategy default — must reach the
 * record, not the raw input the caller may have omitted.
 *
 * @module mcp/tools/consensus-vote-ratifies-pr.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import { VOTE_RECORDS_PATH_ENV } from '../../audit/vote-record-store.js';
import type { VoteRecord } from '../../audit/vote-record.js';
import { verifyVoteRecordSet } from '../../audit/vote-record.js';
import { parseVoteRecordsText } from '../../audit/vote-record-store.js';

const collectRealVotesMock = vi.fn<(opts: { roles: readonly VoterRole[] }) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { roles: readonly VoterRole[] }): Promise<unknown> =>
    collectRealVotesMock(opts),
}));

// NO recording mock: the point is to reach the REAL recorder.
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  toSdkCallbackWithBudgetCheck: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler:
    (fn: (args: unknown, ctx: unknown) => unknown) => (args: unknown, ctx: unknown) =>
      fn(args, ctx),
}));

import { registerConsensusVoteTool } from './consensus-vote.js';
import { ConsensusVoteInputSchema } from './consensus-vote-types.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

interface CapturedToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

function captureHandler(): (args: unknown, ctx: unknown) => Promise<CapturedToolResult> {
  let captured: ((args: unknown, ctx: unknown) => Promise<CapturedToolResult>) | undefined;
  const mockServer = {
    registerTool: (_name: string, _schema: unknown, handler: unknown) => {
      captured = handler as (args: unknown, ctx: unknown) => Promise<CapturedToolResult>;
    },
  };
  registerConsensusVoteTool(mockServer as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

const CTX = {
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  requestContext: {},
};

const HEAD = '0123456789abcdef0123456789abcdef01234567';

describe('ratifiesPr reaches the persisted vote record and the id reaches the caller (#5130)', () => {
  let tmpDir: string;
  let ledger: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const originalLedger = process.env[VOTE_RECORDS_PATH_ENV];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-vote-ratifies-pr-'));
    ledger = join(tmpDir, 'vote-records.jsonl');
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    process.env[VOTE_RECORDS_PATH_ENV] = ledger;
    resetNexusDataDirCache();
    resetJobConcurrency();
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockResolvedValue([
      {
        role: 'architect',
        vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
        source: 'llm',
        cli: 'claude',
        processingTimeMs: 1,
      } satisfies Partial<AgentVoteResult>,
    ]);
  });

  afterEach(() => {
    if (originalDataDir === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DATA_DIR');
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    if (originalLedger === undefined) Reflect.deleteProperty(process.env, VOTE_RECORDS_PATH_ENV);
    else process.env[VOTE_RECORDS_PATH_ENV] = originalLedger;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists the binding through the real recorder and returns the record id', async () => {
    const handler = captureHandler();
    const result = await handler(
      {
        proposal: 'Ratify PR #6200',
        strategy: 'supermajority',
        quickMode: true,
        ratifiesPr: { pr: 6200, headSha: HEAD },
      },
      CTX
    );
    expect(result.isError).not.toBe(true);

    const { records, invalidLines } = parseVoteRecordsText(readFileSync(ledger, 'utf-8'));
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.ratifiesPr).toEqual({ pr: 6200, headSha: HEAD });
    // 1.13, not 1.10: every record the live producer writes carries the
    // effective error policy (#6211) and a salted digest of each voter's
    // reasoning (#6263); the voter tier outranks the binding tier.
    expect(record.version).toBe('1.13');
    expect(verifyVoteRecordSet(records).ok).toBe(true);

    // The caller-commits script is keyed on the record id; the response must
    // carry it, or nothing downstream of the vote can name the record.
    const response = JSON.parse(result.content[0]!.text) as {
      voteRecordPersisted: boolean;
      voteRecordId?: string;
    };
    expect(response.voteRecordPersisted).toBe(true);
    expect(response.voteRecordId).toBe(record.id);
  });

  it('records NO binding when the caller passed none — the pair', async () => {
    const handler = captureHandler();
    const result = await handler(
      { proposal: 'Yes or no', strategy: 'simple_majority', quickMode: true },
      CTX
    );
    const { records } = parseVoteRecordsText(readFileSync(ledger, 'utf-8'));
    expect(records).toHaveLength(1);
    expect('ratifiesPr' in records[0]!).toBe(false);
    // The id still travels: it is a property of persistence, not of binding.
    const response = JSON.parse(result.content[0]!.text) as { voteRecordId?: string };
    expect(response.voteRecordId).toBe(records[0]!.id);
  });

  it('the input schema refuses an abbreviated or uppercase head sha and a non-positive PR', () => {
    const base = { proposal: 'p' };
    const accepts = (ratifiesPr: unknown): boolean =>
      ConsensusVoteInputSchema.safeParse({ ...base, ratifiesPr }).success;
    expect(accepts({ pr: 6200, headSha: HEAD })).toBe(true);
    expect(accepts(undefined)).toBe(true);
    expect(accepts({ pr: 6200, headSha: 'abc1234' })).toBe(false);
    expect(accepts({ pr: 6200, headSha: HEAD.toUpperCase() })).toBe(false);
    expect(accepts({ pr: 0, headSha: HEAD })).toBe(false);
    expect(accepts({ pr: 6200 })).toBe(false);
    expect(accepts({ headSha: HEAD })).toBe(false);
  });
});

describe('the persisted record carries the error policy the panel ran under (#6211, schema 1.11)', () => {
  let tmpDir: string;
  let ledger: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const originalLedger = process.env[VOTE_RECORDS_PATH_ENV];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-vote-error-policy-'));
    ledger = join(tmpDir, 'vote-records.jsonl');
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    process.env[VOTE_RECORDS_PATH_ENV] = ledger;
    resetNexusDataDirCache();
    resetJobConcurrency();
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockResolvedValue([
      {
        role: 'architect',
        vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
        source: 'llm',
        cli: 'claude',
        processingTimeMs: 1,
      } satisfies Partial<AgentVoteResult>,
    ]);
  });

  afterEach(() => {
    if (originalDataDir === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DATA_DIR');
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    if (originalLedger === undefined) Reflect.deleteProperty(process.env, VOTE_RECORDS_PATH_ENV);
    else process.env[VOTE_RECORDS_PATH_ENV] = originalLedger;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function recordFor(input: Record<string, unknown>): Promise<VoteRecord> {
    const handler = captureHandler();
    const result = await handler({ quickMode: true, ...input }, CTX);
    expect(result.isError).not.toBe(true);
    const { records, invalidLines } = parseVoteRecordsText(readFileSync(ledger, 'utf-8'));
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    expect(verifyVoteRecordSet(records).ok).toBe(true);
    return records[0]!;
  }

  it('records the policy the caller passed', async () => {
    const record = await recordFor({
      proposal: 'Ratify PR #6211',
      strategy: 'supermajority',
      errorPolicy: 'absolute_quorum',
      ratifiesPr: { pr: 6211, headSha: HEAD },
    });
    expect(record.errorPolicy).toBe('absolute_quorum');
    expect(record.version).toBe('1.13');
  });

  it('records the RESOLVED default when the caller passed none — the effective policy, not the raw input', async () => {
    // `executeVoting` runs `input.errorPolicy ?? getDefaultErrorPolicy(strategy)`;
    // a record that carried the raw input would be ABSENT here and read as
    // "unrecorded" to the ledger gate, when the panel in fact ran under
    // `reduce_denominator` — the policy the gate exists to catch.
    const record = await recordFor({ proposal: 'Yes or no', strategy: 'supermajority' });
    expect(record.errorPolicy).toBe('reduce_denominator');
  });

  it('the resolved default is per strategy: unanimous runs under fail_closed', async () => {
    const record = await recordFor({ proposal: 'Yes or no', strategy: 'unanimous' });
    expect(record.errorPolicy).toBe('fail_closed');
  });
});
