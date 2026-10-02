/** Aggregate reasons survive the MCP and ledger boundaries (#4334). */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import { createLogger } from '../../core/index.js';
import {
  PR_REVIEW_RECORDS_PATH_ENV,
  readPrReviewRecords,
} from '../../audit/pr-review-record-store.js';
import type { HandlerContext } from '../middleware/secure-handler.js';

const panel = vi.hoisted(() => ({ votes: [] as AgentVoteResult[] }));
vi.mock('../../cli/voter-agents.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli/voter-agents.js')>()),
  collectRealVotes: () => Promise.resolve(panel.votes),
}));
vi.mock('../../cli-adapters/factory.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli-adapters/factory.js')>()),
  getAvailableClis: () => Promise.resolve([]),
}));
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({ createSecureHandler: (fn: unknown) => fn }));

import { PR_REVIEW_ROLES, registerPrReviewTool } from './pr-review-tool.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<{ content: Array<{ text: string }> }>;
const ctx: Ctx = {
  logger: createLogger({ tool: 'pr-review-reason.test' }),
  sanitization: {
    wasModified: false,
    commentsRemoved: 0,
    fieldsModified: 0,
    tagsRemoved: 0,
    rawFieldHashes: { prDiff: 'b'.repeat(64) },
    rawFieldBytes: {},
  },
};

async function review(): Promise<Record<string, unknown>> {
  let handler: Handler | undefined;
  registerPrReviewTool(
    {
      registerTool: (_name: string, _schema: unknown, fn: Handler) => {
        handler = fn;
      },
    } as never,
    {
      rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
    }
  );
  if (handler === undefined) throw new Error('handler not registered');
  const response = await handler(
    {
      prTitle: 'Reason disclosure',
      prNumber: 4334,
      baseSha: 'c'.repeat(40),
      prDiff: 'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-a\n+b\n',
    },
    ctx
  );
  return JSON.parse(response.content[0]!.text) as Record<string, unknown>;
}

describe('aggregate reason transport (#4334)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(process.cwd(), '.pr-review-reason-'));
    vi.stubEnv(PR_REVIEW_RECORDS_PATH_ENV, join(dir, 'records.jsonl'));
    vi.stubEnv('NEXUS_DATA_DIR', dir);
    panel.votes = PR_REVIEW_ROLES.map((role) => ({
      role,
      source: 'llm',
      processingTimeMs: 1,
      vote: {
        decision: role === 'security' ? 'reject' : 'approve',
        confidence: 0.9,
        reasoning: 'test',
        ...(role === 'security'
          ? {
              findings: [
                {
                  summary: 'Real bug',
                  location: 'a.ts:10',
                  severity: 'high',
                  claim: 'Concrete failure',
                  gate: {
                    reread_cited_line: 'passed',
                    traced_call_path: 'passed',
                    named_assertion: 'Concrete failing assertion',
                    ruled_out_language_non_issue: 'passed',
                  },
                },
              ],
            }
          : {}),
      },
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  const reason = 'unconfirmed: 1 reviewer (security) at `a.ts:10`; needs second reviewer';
  it('returns the unconfirmed reason in the MCP response', async () => {
    expect(await review()).toMatchObject({ summary: 'request_changes', verified: false, reason });
  });
  it('logs an unconfirmed finding without claiming a quorum failure', async () => {
    const warning = vi.spyOn(ctx.logger, 'warn');
    await review();
    expect(warning).toHaveBeenCalledWith(
      'pr_review aggregate is unverified',
      expect.objectContaining({ reason, absentCount: 0 })
    );
  });
  it('persists the reason separately from the summary in the ledger', async () => {
    await review();
    const { records, invalidLines } = readPrReviewRecords(join(dir, 'records.jsonl'));
    expect(invalidLines).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toHaveProperty('reason', reason);
    expect(records[0]?.summary).not.toContain('unconfirmed');
  });
});
