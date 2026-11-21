/**
 * pr_review tells the panel collector what bounds its run (#7764).
 *
 * The async job body is bounded by the `async-job-body` guard, not the sync request cap it was
 * dispatched from, so `collectRealVotes` must receive `runsAs: 'async-job'` there and `'request'`
 * inline. Before #7764 both paths clamped the panel deadline to the sync cap (890 s), so
 * `dispatch: "async"` hit the same cutoff as a sync call. The collector is canned so the assertion can
 * read what it was handed; everything around it is real.
 *
 * @module mcp/tools/pr-review-deadline-guard.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VoterRole } from '../../cli/vote-types.js';

vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));
const collectRealVotesMock =
  vi.fn<(opts: { roles: readonly VoterRole[]; runsAs?: string }) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli/voter-agents.js')>()),
  collectRealVotes: (opts: { roles: readonly VoterRole[]; runsAs?: string }): Promise<unknown> =>
    collectRealVotesMock(opts),
}));

import { registerPrReviewTool } from './pr-review-tool.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { createLogger } from '../../core/index.js';

type Handler = (args: unknown, ctx: unknown) => Promise<{ content: { text: string }[] }>;

function captureHandler(): Handler {
  let captured: Handler | undefined;
  registerPrReviewTool(
    {
      registerTool: (_name: string, _schema: unknown, handler: unknown) => {
        captured = handler as Handler;
      },
    } as never,
    { rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never }
  );
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

const CTX = {
  logger: createLogger({ tool: 'pr_review.test' }),
  sanitization: {
    wasModified: false,
    commentsRemoved: 0,
    fieldsModified: 0,
    tagsRemoved: 0,
    rawFieldHashes: {},
    rawFieldBytes: {},
  },
};
const DIFF = 'diff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n-a\n+b\n';

describe('pr_review panel deadline guard (#7764)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-pr-guard-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockImplementation(({ roles }) =>
      Promise.resolve(
        roles.map((role) => ({
          role,
          vote: { decision: 'approve', reasoning: 'fixture', confidence: 0.9 },
          processingTimeMs: 1,
          source: 'llm',
          cli: 'codex',
          model: 'fixture-model',
        }))
      )
    );
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each([
    ['async', 'async-job'],
    ['sync', 'request'],
  ] as const)('a %s review hands the collector runsAs %s', async (dispatch, runsAs) => {
    const result = await captureHandler()(
      { prTitle: 'x', prDiff: DIFF, simulate: true, dispatch },
      CTX
    );
    if (dispatch === 'async') {
      const jobId = (JSON.parse(result.content[0]!.text) as Record<string, unknown>)[
        'jobId'
      ] as string;
      await vi.waitFor(
        () => {
          expect(readJobResult(jobId)?.status).not.toBe('pending');
        },
        { timeout: 10_000, interval: 20 }
      );
    }
    expect(collectRealVotesMock).toHaveBeenCalled();
    expect(collectRealVotesMock.mock.calls[0]?.[0].runsAs).toBe(runsAs);
  });
});
