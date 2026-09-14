/**
 * Seam test: `cancel_job`'s signal reaches `collectRealVotes` from an async
 * `supply_chain_tradeoff_panel` dispatch (#5393).
 *
 * The launcher's cancel gate is covered in `voter-agents-deadline.test.ts`
 * and the runner's `signalAccepted` record follows its arity — both stay
 * green if the tool drops the signal between them. Asserted on what the
 * collector RECEIVED.
 *
 * @module mcp/tools/supply-chain-tradeoff-panel-cancel-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import { createLogger } from '../../core/index.js';

const collectRealVotesMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli/voter-agents.js')>()),
  collectRealVotes: (...args: unknown[]) => collectRealVotesMock(...args),
}));
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

import { registerSupplyChainTradeoffPanelTool } from './supply-chain-tradeoff-panel.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

type Ctx = { logger: ReturnType<typeof createLogger> };
type Handler = (args: unknown, ctx: Ctx) => Promise<{ content: Array<{ text: string }> }>;

const CTX: Ctx = { logger: createLogger({ tool: 'supply-chain-cancel-seam.test' }) };

function captureHandler(): Handler {
  let handler: Handler | undefined;
  registerSupplyChainTradeoffPanelTool(
    {
      registerTool: (_name: string, _schema: unknown, cb: Handler) => {
        handler = cb;
      },
    } as never,
    { rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never }
  );
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

/** The shape `createErrorVoteResult` produces: an errored seat still carries an abstain. */
function erroredVotes(roles: readonly VoterRole[]): AgentVoteResult[] {
  return roles.map((role) => ({
    role,
    vote: { decision: 'abstain' as const, reasoning: '[Error] voters failed', confidence: 0 },
    error: 'voters failed',
    processingTimeMs: 1,
    source: 'error' as const,
  }));
}

function collectorOptions(): Record<string, unknown> {
  const call = collectRealVotesMock.mock.calls[0];
  if (call === undefined) throw new Error('collectRealVotes was not called');
  return call[0] as Record<string, unknown>;
}

describe('supply_chain_tradeoff_panel hands cancel_job’s signal to the collector (#5393)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-sc-cancel-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockImplementation((opts: unknown) =>
      Promise.resolve(erroredVotes((opts as { roles: readonly VoterRole[] }).roles))
    );
  });

  afterEach(async () => {
    await new Promise((r) => setImmediate(r));
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('async dispatch: the collector receives an AbortSignal and the record says so', async () => {
    const response = await captureHandler()(
      { proposal: 'Should we adopt dep X?', quickMode: true, dispatch: 'async' },
      CTX
    );
    const jobId = (JSON.parse(response.content[0]!.text) as { jobId: string }).jobId;
    expect(readJobResult(jobId)?.signalAccepted).toBe(true);

    await new Promise((r) => setImmediate(r));
    expect(collectorOptions()['signal']).toBeInstanceOf(AbortSignal);
  });

  it('sync path: the collector receives no signal — the empty case', async () => {
    await captureHandler()({ proposal: 'Should we adopt dep X?', quickMode: true }, CTX);
    expect(collectorOptions()['signal']).toBeUndefined();
  });
});
