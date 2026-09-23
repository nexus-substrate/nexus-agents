/**
 * Seam test for #5422: the undeclared-options detector's verdict must reach
 * the persisted decision-cost record on EVERY vote — fired or not.
 *
 * Why this hop and not a fixture: `detectUndeclaredOptions` being correct and
 * the store accepting the field are each true independently of whether
 * `consensus-vote.ts` connects them, and the entry hop is the one a
 * fixture-only test skips. Same harness as `consensus-vote-ratifies-pr.test.ts`
 * (#5130): `collectRealVotes` is canned, everything downstream is real, with
 * the data dir pointed at a temp directory.
 *
 * Why the decision-cost store: it is the one durable per-vote record written
 * OUTSIDE `src/audit/` (the governor path), keyed by the same `decisionId` the
 * audit record carries as `correlationId`, so a fired row can be joined back to
 * its ledger line for hand-labelling. The ledger itself stores a 503-char
 * proposal preview, which is why precision cannot be measured there (#5422).
 *
 * @module mcp/tools/consensus-vote-detector-verdict.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import { VOTE_RECORDS_PATH_ENV } from '../../audit/vote-record-store.js';
import { DecisionCostStore } from '../../observability/decision-cost-store.js';
import { getDecisionCostFile } from '../../config/learning-persistence.js';

const collectRealVotesMock = vi.fn<(opts: { roles: readonly VoterRole[] }) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { roles: readonly VoterRole[] }): Promise<unknown> =>
    collectRealVotesMock(opts),
}));

// NO recording mock: the point is to reach the REAL recorder.
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  toSdkCallbackWithTimeoutCheck: (fn: unknown) => fn,
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

describe('the detector verdict reaches the decision-cost record on every vote (#5422)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const originalLedger = process.env[VOTE_RECORDS_PATH_ENV];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-vote-detector-verdict-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    process.env[VOTE_RECORDS_PATH_ENV] = join(tmpDir, 'vote-records.jsonl');
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

  function readStore(): DecisionCostStore {
    // Hydrates from the file the live recorder wrote under the temp data dir.
    return new DecisionCostStore({ filePath: getDecisionCostFile(), dataDir: tmpDir });
  }

  it('writes a NOT-FIRED verdict on an ordinary proposal — the denominator row', async () => {
    const handler = captureHandler();
    const result = await handler(
      { proposal: 'Ship the rate-limit fix?', strategy: 'simple_majority', quickMode: true },
      CTX
    );
    expect(result.isError).not.toBe(true);

    const records = readStore().all();
    expect(records).toHaveLength(1);
    expect(records[0]?.gate).toBe('consensus_vote');
    expect(records[0]?.undeclaredOptionsDetector).toEqual({
      fired: false,
      declaredOptionCount: 0,
    });
  });

  it('writes a FIRED verdict with the pattern and an excerpt from the FULL proposal', async () => {
    const handler = captureHandler();
    // The option prose sits past the ledger's 503-char preview cut on purpose.
    const proposal = `${'context. '.repeat(70)}\n\nOption A — keep it.\nOption B — migrate.`;
    const result = await handler({ proposal, strategy: 'simple_majority', quickMode: true }, CTX);
    expect(result.isError).not.toBe(true);

    const verdict = readStore().all()[0]?.undeclaredOptionsDetector;
    expect(verdict?.fired).toBe(true);
    expect(verdict?.pattern).toBe(String(/\b(?:Option|OPTION) [A-Z0-9]\b/));
    expect(verdict?.excerpt).toContain('Option A');
    expect(verdict?.declaredOptionCount).toBe(0);
  });

  it('records the declared option count and a not-fired verdict when options ARE declared', async () => {
    const handler = captureHandler();
    collectRealVotesMock.mockResolvedValue([
      {
        role: 'architect',
        vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok', selectedOption: 'A' },
        source: 'llm',
        cli: 'claude',
        processingTimeMs: 1,
      } satisfies Partial<AgentVoteResult>,
    ]);
    await handler(
      {
        proposal: 'Option A — keep it. Option B — migrate.',
        strategy: 'simple_majority',
        quickMode: true,
        options: ['A', 'B'],
      },
      CTX
    );
    expect(readStore().all()[0]?.undeclaredOptionsDetector).toEqual({
      fired: false,
      declaredOptionCount: 2,
    });
  });
});
