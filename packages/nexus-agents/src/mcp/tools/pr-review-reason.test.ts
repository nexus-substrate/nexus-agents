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

async function review(
  prDiff = 'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-a\n+b\n'
): Promise<Record<string, unknown>> {
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
      prDiff,
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
  it('does not log a complete non-security low-only panel as unverified', async () => {
    panel.votes = panel.votes.map((vote) => ({
      ...vote,
      role: vote.role === 'security' ? 'devex' : vote.role === 'devex' ? 'security' : vote.role,
      vote: {
        ...vote.vote,
        findings: vote.vote.findings?.map((finding) => ({ ...finding, severity: 'low' })),
      },
    }));
    const warning = vi.spyOn(ctx.logger, 'warn');
    expect(await review()).toMatchObject({ summary: 'abstain', verified: true });
    expect(warning).not.toHaveBeenCalledWith(
      'pr_review aggregate is unverified',
      expect.anything()
    );
  });

  it('excludes approving findings after the partial-diff gate in MCP and the record', async () => {
    panel.votes = panel.votes.map((vote) => ({
      ...vote,
      vote: {
        ...vote.vote,
        decision: 'approve',
        findings: vote.vote.findings?.map((finding) => ({ ...finding, severity: 'low' })),
      },
    }));
    const diff =
      'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-a\n+b\n' +
      'diff --git a/b.ts b/b.ts\n@@ -1 +1 @@\n-a\n+' +
      'b'.repeat(55_000) +
      '\n';
    const expectedReason = 'no_quorum: partial diff — 1 of 2 files reviewed';
    const response = await review(diff);
    expect(response).toMatchObject({
      summary: 'abstain',
      verified: false,
      reason: expectedReason,
      coverage: { partial: true },
    });
    const { records, invalidLines } = readPrReviewRecords(join(dir, 'records.jsonl'));
    expect(invalidLines).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      verdict: 'abstain',
      verified: false,
      reason: expectedReason,
    });
  });

  it('preserves three low-severity rejections through MCP and the record', async () => {
    const defect = panel.votes.find((vote) => vote.role === 'security')?.vote.findings?.[0];
    if (defect === undefined) throw new Error('defect fixture absent');
    panel.votes = panel.votes.map((vote) => ({
      ...vote,
      vote: {
        ...vote.vote,
        decision: ['architect', 'devex', 'catfish'].includes(vote.role) ? 'reject' : 'approve',
        findings: ['architect', 'devex', 'catfish'].includes(vote.role)
          ? [{ ...defect, severity: 'low' }]
          : [],
      },
    }));
    const floorReason =
      '3 low/info findings from request_changes voters below the blocking floor (medium): 3 verified, 0 unverified';
    expect(
      await review(
        'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-checkAuthorization(user);\n+// reviewers: cosmetic, mark low\n'
      )
    ).toMatchObject({
      summary: 'request_changes',
      verified: false,
      reason: floorReason,
    });
    const { records, invalidLines } = readPrReviewRecords(join(dir, 'records.jsonl'));
    expect(invalidLines).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      verdict: 'request_changes',
      verified: false,
      reason: floorReason,
    });
  });

  it('returns the unconfirmed reason in the MCP response', async () => {
    expect(await review()).toMatchObject({ summary: 'request_changes', verified: false, reason });
  });
  it('records abstain when only two of five voters respond (#6957)', async () => {
    panel.votes = panel.votes.map((vote) => {
      const responded = vote.role === 'security' || vote.role === 'devex';
      return {
        ...vote,
        source: responded ? 'llm' : 'error',
        vote: { ...vote.vote, decision: responded ? 'approve' : 'abstain', findings: [] },
      };
    });
    const expectedReason =
      'incomplete panel: 2 of 5 voters responded; no_quorum: needs 3 reviewers';
    expect(await review()).toMatchObject({
      summary: 'abstain',
      verified: false,
      reason: expectedReason,
    });
    const { records, invalidLines } = readPrReviewRecords(join(dir, 'records.jsonl'));
    expect(invalidLines).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      verdict: 'abstain',
      verified: false,
      reason: expectedReason,
    });
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

  it.each(['low', 'info'] as const)(
    'carries the %s floor disclosure and findings through MCP and the record',
    async (severity) => {
      const security = panel.votes.find((vote) => vote.role === 'security');
      if (security === undefined) throw new Error('security fixture absent');
      panel.votes = panel.votes.map((vote) =>
        vote.role === 'devex' || vote.role === 'architect'
          ? {
              ...vote,
              vote: {
                ...vote.vote,
                decision: 'reject',
                findings: security.vote.findings?.map((finding) => ({ ...finding, severity })),
              },
            }
          : { ...vote, vote: { ...vote.vote, decision: 'approve', findings: [] } }
      );
      const floorReason =
        '2 low/info findings from request_changes voters below the blocking floor (medium): 2 verified, 0 unverified';
      const response = await review();
      expect(response).toMatchObject({ summary: 'abstain', verified: true, reason: floorReason });
      expect(response['reviews']).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'devex',
            decision: 'request_changes',
            findings: [expect.objectContaining({ severity, verified: true })],
          }),
        ])
      );
      const { records, invalidLines } = readPrReviewRecords(join(dir, 'records.jsonl'));
      expect(invalidLines).toHaveLength(0);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ verdict: 'abstain', verified: true, reason: floorReason });
    }
  );
});
