/**
 * Seam test for #6053: `args.options` must reach the persisted vote record.
 *
 * Four hops carry `declaredOptions` from the tool input to the ledger; the
 * entry hop — `consensus-vote.ts` passing `args.options` into
 * `recordVoteSideEffects` — had no behavioural test. Mutating it to `undefined`
 * left the whole suite green. That is the #6049 defect in its second location,
 * and it is exactly what a future edit could silently restore.
 *
 * The harness is `consensus-vote-async-dispatch.test.ts`'s, minus its recording
 * mock: `collectRealVotes` is canned, everything downstream is real, and the
 * ledger is pointed at a temp file via `NEXUS_VOTE_RECORDS_PATH`.
 *
 * @module mcp/tools/consensus-vote-declared-options.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import { VOTE_RECORDS_PATH_ENV } from '../../audit/vote-record-store.js';

// Every voter errors — the realistic shape of a dead voter panel (expired auth,
// adapter outage), and the exact input for which `handleConsensusVote` returns
// `{ ok: false }` rather than manufacturing a "rejected" verdict (#1552).
const collectRealVotesMock = vi.fn<(opts: { roles: readonly VoterRole[] }) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { roles: readonly VoterRole[] }): Promise<unknown> =>
    collectRealVotesMock(opts),
}));

// NO recording mock here: the whole point is to reach the REAL recorder.
// Pass the registered callback through untouched so the test can invoke it.
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
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

interface CapturedToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

/** Registers the tool against a mock server and returns the captured callback. */
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

describe('declared options reach the persisted vote record (#6053)', () => {
  let tmpDir: string;
  let ledger: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const originalLedger = process.env[VOTE_RECORDS_PATH_ENV];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-vote-declared-'));
    ledger = join(tmpDir, 'vote-records.jsonl');
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    process.env[VOTE_RECORDS_PATH_ENV] = ledger;
    resetNexusDataDirCache();
    resetJobConcurrency();
    collectRealVotesMock.mockReset();
    // One LIVE approve. `source: 'llm'` so the recorder does not refuse as
    // all-simulated; a single vote so the tally is unambiguous.
    collectRealVotesMock.mockResolvedValue([
      {
        role: 'architect',
        vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok', selectedOption: 'A' },
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

  it('persists the options the caller declared, through the real recorder', async () => {
    const handler = captureHandler();
    const result = await handler(
      { proposal: 'Pick one', strategy: 'simple_majority', quickMode: true, options: ['A', 'B'] },
      CTX
    );
    expect(result.isError).not.toBe(true);

    const lines = readFileSync(ledger, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!) as {
      optionTally?: unknown[];
      optionCoverage?: { approverCount: number };
    };
    // The record stores no raw `declaredOptions`; it stores the DERIVED block,
    // which `deriveOptionFields` emits only when options were declared and
    // omits entirely when they were not. Presence of the block is therefore
    // the signal that `args.options` reached the recorder — and `approverCount`
    // proves the declared options were consulted against the real vote, not
    // filled from a default. (The tally's contents belong to #6049/#6050.)
    expect(Array.isArray(record.optionTally)).toBe(true);
    expect(record.optionCoverage?.approverCount).toBe(1);
  });

  it('records NO declared options when the caller declared none — the pair', async () => {
    // Without this, always writing ['A','B'] would pass the row above.
    const handler = captureHandler();
    await handler({ proposal: 'Yes or no', strategy: 'simple_majority', quickMode: true }, CTX);
    const line = readFileSync(ledger, 'utf-8')
      .split('\n')
      .find((l) => l.trim() !== '');
    const record = JSON.parse(line!) as { optionTally?: unknown; optionCoverage?: unknown };
    expect(record.optionTally).toBeUndefined();
    expect(record.optionCoverage).toBeUndefined();
  });
});
