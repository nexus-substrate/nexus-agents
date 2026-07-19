/**
 * Tests for the pr_review MCP tool (#2233 Child 1).
 *
 * Focuses on pure logic — proposal construction, decision mapping,
 * aggregation, summarization — since the handler integration test
 * lives in the consensus-vote integration suite.
 *
 * @module mcp/tools/pr-review-tool.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// #3731: pass-through the secure-handler / timeout chain so the registered
// callback is the bare `(args, ctx)` handler — lets the async-dispatch tests
// invoke it directly.
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

import {
  MAX_DIFF_INPUT_LENGTH,
  PR_REVIEW_ROLES,
  PrReviewInputSchema,
  aggregatePrDecisions,
  buildPrReviewProposal,
  mapVoteDecisionToPrDecision,
  registerPrReviewTool,
  type PrReviewAggregate,
  type PrReviewVote,
} from './pr-review-tool.js';
import { applyPartialCoverageGate, type PrReviewCoverage } from './pr-review-diff-budget.js';
import { ERROR_ENVELOPE_META_KEY } from '../error-envelope.js';
import { persistReviewRecord } from './pr-review-record-producer.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { createLogger } from '../../core/index.js';
import {
  PR_REVIEW_RECORDS_PATH_ENV,
  readPrReviewRecords,
} from '../../audit/pr-review-record-store.js';
import { computeReviewedDiffHash } from '../../audit/reviewed-diff-hash.js';
import { verifyPrReviewRecordSet } from '../../audit/pr-review-record.js';

describe('pr_review tool', () => {
  describe('PR_REVIEW_ROLES', () => {
    it('should be exactly 5 roles per #2233 design', () => {
      expect(PR_REVIEW_ROLES).toHaveLength(5);
    });

    it('should include code-level voters (not pm/ai_ml)', () => {
      const set = new Set(PR_REVIEW_ROLES);
      expect(set.has('architect')).toBe(true);
      expect(set.has('security')).toBe(true);
      expect(set.has('devex')).toBe(true);
      expect(set.has('catfish')).toBe(true);
      expect(set.has('scope_steward')).toBe(true);
    });

    it('should NOT include pm or ai_ml (proposal-level roles)', () => {
      const set = new Set(PR_REVIEW_ROLES);
      expect(set.has('pm')).toBe(false);
      expect(set.has('ai_ml')).toBe(false);
    });
  });

  describe('mapVoteDecisionToPrDecision', () => {
    it('should map approve to approve', () => {
      expect(mapVoteDecisionToPrDecision('approve')).toBe('approve');
    });

    it('should map reject to request_changes', () => {
      expect(mapVoteDecisionToPrDecision('reject')).toBe('request_changes');
    });

    it('should map abstain to abstain', () => {
      expect(mapVoteDecisionToPrDecision('abstain')).toBe('abstain');
    });
  });

  describe('aggregatePrDecisions (#2233 Child 3 — verification gate)', () => {
    const VERIFIED_FINDING = {
      summary: 'Real bug',
      location: 'src/a.ts:10',
      severity: 'high' as const,
      claim: 'Concrete failure described here',
      gate: {
        reread_cited_line: 'passed' as const,
        traced_call_path: 'passed' as const,
        named_assertion: 'A specific assertion that would fail',
        ruled_out_language_non_issue: 'passed' as const,
      },
      verified: true,
    };
    const UNVERIFIED_FINDING = {
      summary: 'Suspicious pattern',
      location: 'src/b.ts:42',
      severity: 'medium' as const,
      claim: 'Could be safer',
      gate: {
        reread_cited_line: 'skipped' as const,
        traced_call_path: 'passed' as const,
        named_assertion: 'short',
        ruled_out_language_non_issue: 'passed' as const,
      },
      verified: false,
    };

    const makeReview = (
      role: PrReviewVote['role'],
      decision: PrReviewVote['decision'],
      opts: {
        source?: PrReviewVote['source'];
        findings?: PrReviewVote['findings'];
      } = {}
    ): PrReviewVote => ({
      role,
      decision,
      confidence: 0.8,
      reasoning: 'test',
      findings: opts.findings ?? [],
      source: opts.source ?? 'llm',
      processingTimeMs: 100,
    });

    it('approves when all voters approve', () => {
      const reviews = [
        makeReview('architect', 'approve'),
        makeReview('security', 'approve'),
        makeReview('devex', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'approve', verified: true });
    });

    it('triggers VERIFIED request_changes when a voter has a verified finding (#2225)', () => {
      const reviews = [
        makeReview('architect', 'approve'),
        makeReview('security', 'request_changes', { findings: [VERIFIED_FINDING] }),
        makeReview('devex', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({
        decision: 'request_changes',
        verified: true,
      });
    });

    it('does NOT trigger request_changes when ONE voter dissents without verified finding', () => {
      // Only 1 of 3 voters dissents — below the soft-block threshold of 3.
      const reviews = [
        makeReview('architect', 'approve'),
        makeReview('security', 'request_changes', { findings: [UNVERIFIED_FINDING] }),
        makeReview('devex', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('triggers SOFT request_changes when ≥3/5 voters dissent without verified findings (#2250)', () => {
      // Empirically observed in the #2241 retest: voters reliably flag
      // diff-readable bugs by majority but don't emit YAML findings. The
      // soft-block path catches that signal; tagged unverified.
      const reviews = [
        makeReview('architect', 'request_changes', { findings: [] }),
        makeReview('security', 'request_changes', { findings: [UNVERIFIED_FINDING] }),
        makeReview('devex', 'request_changes', { findings: [] }),
        makeReview('catfish', 'approve'),
        makeReview('scope_steward', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({
        decision: 'request_changes',
        verified: false,
      });
    });

    it('soft-block requires the threshold of 3 — 2/5 dissent stays abstain', () => {
      const reviews = [
        makeReview('architect', 'request_changes'),
        makeReview('security', 'request_changes'),
        makeReview('devex', 'approve'),
        makeReview('catfish', 'approve'),
        makeReview('scope_steward', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('verified blocker beats soft block — even 1 verified finding wins', () => {
      const reviews = [
        makeReview('architect', 'request_changes', { findings: [VERIFIED_FINDING] }),
        makeReview('security', 'approve'),
        makeReview('devex', 'approve'),
        makeReview('catfish', 'approve'),
        makeReview('scope_steward', 'approve'),
      ];
      // Even with 4 approves, a single verified finding triggers
      // verified=true request_changes — the gate's intent is preserved.
      expect(aggregatePrDecisions(reviews)).toEqual({
        decision: 'request_changes',
        verified: true,
      });
    });

    it('triggers request_changes if at least one finding is verified (mixed findings)', () => {
      const reviews = [
        makeReview('security', 'request_changes', {
          findings: [UNVERIFIED_FINDING, VERIFIED_FINDING],
        }),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({
        decision: 'request_changes',
        verified: true,
      });
    });

    it('ignores findings on error votes', () => {
      const reviews = [
        makeReview('security', 'request_changes', {
          source: 'error',
          findings: [VERIFIED_FINDING],
        }),
        makeReview('architect', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'approve', verified: true });
    });

    it('soft-block ignores error votes too', () => {
      // 3 request_changes but 1 is error → only 2 valid dissenters.
      const reviews = [
        makeReview('architect', 'request_changes'),
        makeReview('security', 'request_changes'),
        makeReview('devex', 'request_changes', { source: 'error' }),
        makeReview('catfish', 'approve'),
        makeReview('scope_steward', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('returns abstain when all voters errored', () => {
      const reviews = [
        makeReview('architect', 'approve', { source: 'error' }),
        makeReview('security', 'approve', { source: 'error' }),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('returns abstain on mixed approve/abstain (no clear approval)', () => {
      const reviews = [makeReview('architect', 'approve'), makeReview('security', 'abstain')];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('returns abstain on empty input', () => {
      expect(aggregatePrDecisions([])).toEqual({ decision: 'abstain', verified: true });
    });

    describe('absolute_quorum (#4132)', () => {
      const fullPanel = (
        over: Partial<Record<PrReviewVote['role'], Parameters<typeof makeReview>[2]>> = {}
      ): PrReviewVote[] =>
        (['architect', 'security', 'devex', 'catfish', 'scope_steward'] as const).map((role) =>
          makeReview(role, 'approve', over[role])
        );

      it('all 5 approve, 0 errors, catfish present → verified approve', () => {
        expect(aggregatePrDecisions(fullPanel(), 'absolute_quorum')).toEqual({
          decision: 'approve',
          verified: true,
        });
      });

      it('errorCount>0 degrades a would-be approve → abstain/verified:false (no_quorum analogue)', () => {
        const reviews = fullPanel({ scope_steward: { source: 'error' } });
        const out = aggregatePrDecisions(reviews, 'absolute_quorum');
        expect(out.decision).toBe('abstain');
        expect(out.verified).toBe(false);
        expect(out.reason).toContain('scope_steward');
        expect(out.reason).toContain('absolute_quorum');
      });

      it('errored contrarian (catfish) → not verified (never rubber-stamps the merge)', () => {
        const reviews = fullPanel({ catfish: { source: 'error' } });
        const out = aggregatePrDecisions(reviews, 'absolute_quorum');
        expect(out.decision).toBe('abstain');
        expect(out.verified).toBe(false);
        expect(out.reason).toContain('catfish');
      });

      it('missing contrarian (incomplete panel) → not verified', () => {
        // 4-role panel with no catfish: valid.length !== PR_REVIEW_ROLES.length.
        const reviews = [
          makeReview('architect', 'approve'),
          makeReview('security', 'approve'),
          makeReview('devex', 'approve'),
          makeReview('scope_steward', 'approve'),
        ];
        const out = aggregatePrDecisions(reviews, 'absolute_quorum');
        expect(out.decision).toBe('abstain');
        expect(out.verified).toBe(false);
        expect(out.reason).toContain('catfish');
      });

      it('a genuine verified blocker still wins under absolute_quorum (Tier 1 runs first)', () => {
        const reviews = [
          makeReview('architect', 'request_changes', { findings: [VERIFIED_FINDING] }),
          makeReview('security', 'approve'),
          makeReview('devex', 'approve', { source: 'error' }),
          makeReview('catfish', 'approve'),
          makeReview('scope_steward', 'approve'),
        ];
        expect(aggregatePrDecisions(reviews, 'absolute_quorum')).toEqual({
          decision: 'request_changes',
          verified: true,
        });
      });

      it('DEFAULT (standard) is unchanged: an errored voter is dropped → verified approve', () => {
        const reviews = fullPanel({ scope_steward: { source: 'error' } });
        // No policy arg → standard: the pre-#4132 behavior (drop the error).
        expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'approve', verified: true });
      });
    });
  });

  describe('applyPartialCoverageGate — C1 (#4140)', () => {
    const partial = (over: Partial<PrReviewCoverage> = {}): PrReviewCoverage => ({
      reviewedFiles: 2,
      totalFiles: 5,
      droppedFiles: ['src/x.ts', 'src/y.ts', 'src/z.ts'],
      partial: true,
      strategy: 'budget',
      ...over,
    });

    it('BARS a partial would-be verified approve → abstain/verified:false (no_quorum shape)', () => {
      const out = applyPartialCoverageGate({ decision: 'approve', verified: true }, partial());
      expect(out.decision).toBe('abstain');
      expect(out.verified).toBe(false);
      expect(out.reason).toContain('partial diff');
      expect(out.reason).toContain('no_quorum');
      expect(out.reason).toContain('2 of 5');
    });

    it('a request_changes blocker from a REVIEWED file STILL WINS under a partial review', () => {
      const blocker: PrReviewAggregate = { decision: 'request_changes', verified: true };
      expect(applyPartialCoverageGate(blocker, partial())).toEqual(blocker);
    });

    it('a soft request_changes (verified:false) is untouched — a partial review can still block', () => {
      const soft: PrReviewAggregate = { decision: 'request_changes', verified: false };
      expect(applyPartialCoverageGate(soft, partial())).toEqual(soft);
    });

    it('whole-diff review (coverage undefined) → verified approve is unchanged', () => {
      const approve: PrReviewAggregate = { decision: 'approve', verified: true };
      expect(applyPartialCoverageGate(approve, undefined)).toEqual(approve);
    });

    it('non-partial coverage (nothing dropped) → verified approve is unchanged', () => {
      const approve: PrReviewAggregate = { decision: 'approve', verified: true };
      const cov = partial({ partial: false, droppedFiles: [] });
      expect(applyPartialCoverageGate(approve, cov)).toEqual(approve);
    });
  });

  describe('buildPrReviewProposal', () => {
    const baseInput = {
      prTitle: 'Add foo widget',
      prDiff: '--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new',
      simulate: false,
    };

    it('should include the PR title', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('Add foo widget');
    });

    it('should include the diff in a fenced block', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('```diff');
      expect(out).toContain('--- a/foo.ts');
    });

    it('should include the verification gate reference (#2225)', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('#2225');
      expect(out).toContain('verification gate');
    });

    it('should embed the FINDINGS YAML format (#2233 Child 3)', () => {
      // The proposal text instructs voters to emit a structured findings
      // block parseable by pr-review-findings.ts.
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('reread_cited_line');
      expect(out).toContain('traced_call_path');
      expect(out).toContain('named_assertion');
      expect(out).toContain('ruled_out_language_non_issue');
      expect(out).toContain('```yaml findings');
    });

    it('should explicitly demand citations in path/file.ext:line form', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('path/file.ext:LINE');
    });

    it('should include base/head refs only when both are provided', () => {
      const withRefs = buildPrReviewProposal({
        ...baseInput,
        baseRef: 'main',
        headRef: 'feat/x',
      });
      expect(withRefs).toContain('feat/x → main');

      const withoutRefs = buildPrReviewProposal(baseInput);
      expect(withoutRefs).not.toContain('→');
    });

    it('should omit description block when not provided', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).not.toContain('**Description:**');
    });

    it('should include description block when provided', () => {
      const out = buildPrReviewProposal({
        ...baseInput,
        prDescription: 'This adds the foo widget for #1234.',
      });
      expect(out).toContain('**Description:**');
      expect(out).toContain('foo widget for #1234');
    });

    it('should include repo context when provided', () => {
      const out = buildPrReviewProposal({
        ...baseInput,
        repoContext: 'TypeScript monorepo, Result<T,E> pattern, vitest tests.',
      });
      expect(out).toContain('Repo context');
      expect(out).toContain('Result<T,E>');
    });

    it('should label the three decision options approve/reject/abstain', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('APPROVE');
      expect(out).toContain('REJECT');
      expect(out).toContain('ABSTAIN');
    });
  });

  describe('PrReviewInputSchema', () => {
    it('should reject empty title', () => {
      const r = PrReviewInputSchema.safeParse({ prTitle: '', prDiff: 'x' });
      expect(r.success).toBe(false);
    });

    it('should reject empty diff', () => {
      const r = PrReviewInputSchema.safeParse({ prTitle: 'x', prDiff: '' });
      expect(r.success).toBe(false);
    });

    it('accepts a diff between the panel budget and the 2MB input cap (#4140)', () => {
      // Pre-#4140 this hard-failed at 50k; now diffs up to MAX_DIFF_INPUT_LENGTH are
      // accepted and (over 50k) security-prioritized + partially reviewed.
      const r = PrReviewInputSchema.safeParse({ prTitle: 'x', prDiff: 'a'.repeat(50_001) });
      expect(r.success).toBe(true);
    });

    it('should reject a diff over the 2MB input DoS cap (#4140)', () => {
      const r = PrReviewInputSchema.safeParse({
        prTitle: 'x',
        prDiff: 'a'.repeat(MAX_DIFF_INPUT_LENGTH + 1),
      });
      expect(r.success).toBe(false);
    });

    it('should default simulate to false', () => {
      const r = PrReviewInputSchema.safeParse({ prTitle: 'x', prDiff: 'y' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.simulate).toBe(false);
    });

    it('should accept minimal valid input', () => {
      const r = PrReviewInputSchema.safeParse({ prTitle: 'x', prDiff: 'y' });
      expect(r.success).toBe(true);
    });

    it('defaults dispatch to sync and accepts async (#3731)', () => {
      expect(PrReviewInputSchema.parse({ prTitle: 'x', prDiff: 'y' }).dispatch).toBe('sync');
      expect(
        PrReviewInputSchema.parse({ prTitle: 'x', prDiff: 'y', dispatch: 'async' }).dispatch
      ).toBe('async');
      expect(() =>
        PrReviewInputSchema.parse({ prTitle: 'x', prDiff: 'y', dispatch: 'bogus' })
      ).toThrow();
    });
  });
});

// #3731: async dispatch mode. The 5-voter live fan-out can exceed the MCP
// request timeout, so `dispatch: 'async'` returns a jobId immediately and runs
// the panel in the background (poll get_job_result). pr_review has no sessionId,
// so a fresh `pr-<uuid>` jobId is always minted (no idempotency surface).
interface HandlerCtx {
  logger: ReturnType<typeof createLogger>;
}
type CtxHandler = (args: unknown, ctx: HandlerCtx) => Promise<CapturedToolResult>;

interface CapturedToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

const TEST_CTX: HandlerCtx = { logger: createLogger({ tool: 'pr_review.test' }) };

/** Registers the tool against a mock server and returns the captured callback. */
function captureHandler(): CtxHandler {
  let captured: CtxHandler | undefined;
  let registeredName: string | undefined;
  const mockServer = {
    registerTool: (name: string, _schema: unknown, handler: unknown) => {
      registeredName = name;
      captured = handler as CtxHandler;
    },
  };
  registerPrReviewTool(mockServer as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  expect(registeredName).toBe('pr_review');
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

describe('pr_review async dispatch (#3731)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  function envelope(result: CapturedToolResult): Record<string, unknown> {
    return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
  }

  // simulate:true keeps the panel body fast + deterministic (no live adapters).
  const ASYNC_ARGS = { prTitle: 'x', prDiff: 'y', simulate: true, dispatch: 'async' } as const;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-pr-async-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns { status: 'pending', jobId } and mints a pr-<uuid> id", async () => {
    const handler = captureHandler();
    const env = envelope(await handler(ASYNC_ARGS, TEST_CTX));
    expect(env['status']).toBe('pending');
    expect(typeof env['jobId']).toBe('string');
    expect(env['jobId'] as string).toMatch(/^pr-/);
    expect(env['pollTool']).toBe('get_job_result');
  });

  it('runs the panel inline (sync) by default — no pending envelope', async () => {
    const handler = captureHandler();
    const env = envelope(await handler({ prTitle: 'x', prDiff: 'y', simulate: true }, TEST_CTX));
    expect(env['status']).toBeUndefined();
    expect(env['summary']).toBeDefined();
  });

  it('records the panel result so get_job_result resolves when the background run completes', async () => {
    const handler = captureHandler();
    const jobId = envelope(await handler(ASYNC_ARGS, TEST_CTX))['jobId'] as string;
    // The background run is fire-and-forget; let the microtask queue drain.
    await new Promise((r) => setImmediate(r));
    const record = readJobResult(jobId);
    expect(record?.status).toBe('complete');
  });
});

// #4170: simulate must FAIL CLOSED outside test runners — pr_review feeds the
// same collectRealVotes → createSimulatedVotes machinery as consensus_vote, so
// it gets the identical gate (deny outside test runner unless
// NEXUS_ALLOW_SIMULATE=1; per-vote `source: 'simulation'` provenance already
// rides the response).
describe('pr_review simulate fail-closed gate (#4170)', () => {
  const originalVitest = process.env['VITEST'];
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalAllowSimulate = process.env['NEXUS_ALLOW_SIMULATE'];

  /** Simulate a non-test-runner process (no VITEST, production NODE_ENV). */
  function leaveTestRunnerEnv(): void {
    delete process.env['VITEST'];
    process.env['NODE_ENV'] = 'production';
    delete process.env['NEXUS_ALLOW_SIMULATE'];
  }

  afterEach(() => {
    if (originalVitest === undefined) delete process.env['VITEST'];
    else process.env['VITEST'] = originalVitest;
    if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = originalNodeEnv;
    if (originalAllowSimulate === undefined) delete process.env['NEXUS_ALLOW_SIMULATE'];
    else process.env['NEXUS_ALLOW_SIMULATE'] = originalAllowSimulate;
  });

  it('rejects simulate outside a test runner with a permission envelope', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    const result = await handler({ prTitle: 'x', prDiff: 'y', simulate: true }, TEST_CTX);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('NEXUS_ALLOW_SIMULATE');
    const meta = (result as { _meta?: Record<string, unknown> })._meta;
    const envelope = meta?.[ERROR_ENVELOPE_META_KEY] as { errorCategory: string };
    expect(envelope.errorCategory).toBe('permission');
  });

  it('rejects identically in async dispatch mode — no pending envelope leaks out', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    const result = await handler(
      { prTitle: 'x', prDiff: 'y', simulate: true, dispatch: 'async' },
      TEST_CTX
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('NEXUS_ALLOW_SIMULATE');
  });

  it('proceeds when NEXUS_ALLOW_SIMULATE=1 (explicit demo opt-in)', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    process.env['NEXUS_ALLOW_SIMULATE'] = '1';
    const result = await handler({ prTitle: 'x', prDiff: 'y', simulate: true }, TEST_CTX);
    expect(result.isError).not.toBe(true);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(output['summary']).toBeDefined();
  });

  it('stays allowed inside a test runner (existing suites unaffected)', async () => {
    // Default vitest env: VITEST=true.
    const handler = captureHandler();
    const result = await handler({ prTitle: 'x', prDiff: 'y', simulate: true }, TEST_CTX);
    expect(result.isError).not.toBe(true);
  });
});

describe('pr_review Option-C audit-record persistence (#4031)', () => {
  const BASE_SHA = 'c'.repeat(40);
  const APPROVE_AGG: PrReviewAggregate = { decision: 'approve', verified: true };
  const COUNTS = { approveCount: 5, requestChangesCount: 0, abstainCount: 0, errorCount: 0 };
  const logger = createLogger({ tool: 'pr-review-test' });

  let dir: string;
  let prevEnv: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pr-review-tool-records-'));
    prevEnv = process.env[PR_REVIEW_RECORDS_PATH_ENV];
    process.env[PR_REVIEW_RECORDS_PATH_ENV] = join(dir, 'pr-review-records.jsonl');
  });

  afterEach(() => {
    if (prevEnv === undefined) Reflect.deleteProperty(process.env, PR_REVIEW_RECORDS_PATH_ENV);
    else process.env[PR_REVIEW_RECORDS_PATH_ENV] = prevEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  function input(
    overrides: Record<string, unknown> = {}
  ): ReturnType<typeof PrReviewInputSchema.parse> {
    return PrReviewInputSchema.parse({
      prTitle: 'Add audit producer',
      prDiff: 'diff --git a/x b/x\n+line\n',
      simulate: false,
      ...overrides,
    });
  }

  it('persists a record bound to {prNumber, baseSha, reviewedDiffHash} when both inputs + live review', () => {
    const parsed = input({ prNumber: 99, baseSha: BASE_SHA });
    const outcome = persistReviewRecord({
      input: parsed,
      aggregate: APPROVE_AGG,
      counts: COUNTS,
      reviewCount: 5,
      logger,
    });

    expect(outcome.persisted).toBe(true);
    if (!outcome.persisted) throw new Error('expected persisted');
    expect(outcome.prNumber).toBe(99);
    expect(outcome.baseSha).toBe(BASE_SHA);
    // Parity with the gate: producer hashes the EXACT prDiff via the same
    // canonical computeReviewedDiffHash the gate recomputes with (#4031 condition).
    expect(outcome.reviewedDiffHash).toBe(computeReviewedDiffHash(parsed.prDiff));
    expect(outcome.sequence).toBe(0);

    const path = process.env[PR_REVIEW_RECORDS_PATH_ENV] as string;
    const { records, invalidLines } = readPrReviewRecords(path);
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]?.verdict).toBe('approve');
    expect(verifyPrReviewRecordSet(records).ok).toBe(true);
  });

  it('skips with binding-inputs-absent when prNumber or baseSha is missing', () => {
    const onlyPr = persistReviewRecord({
      input: input({ prNumber: 99 }),
      aggregate: APPROVE_AGG,
      counts: COUNTS,
      reviewCount: 5,
      logger,
    });
    expect(onlyPr).toEqual(
      expect.objectContaining({ persisted: false, reason: 'binding-inputs-absent' })
    );
    const onlySha = persistReviewRecord({
      input: input({ baseSha: BASE_SHA }),
      aggregate: APPROVE_AGG,
      counts: COUNTS,
      reviewCount: 5,
      logger,
    });
    expect(onlySha).toEqual(
      expect.objectContaining({ persisted: false, reason: 'binding-inputs-absent' })
    );
    // Nothing written.
    const path = process.env[PR_REVIEW_RECORDS_PATH_ENV] as string;
    expect(readPrReviewRecords(path).records).toHaveLength(0);
  });

  it('skips with reason=simulated even when the binding is present (no governance from non-live output)', () => {
    const outcome = persistReviewRecord({
      input: input({ prNumber: 99, baseSha: BASE_SHA, simulate: true }),
      aggregate: APPROVE_AGG,
      counts: COUNTS,
      reviewCount: 5,
      logger,
    });
    expect(outcome).toEqual(expect.objectContaining({ persisted: false, reason: 'simulated' }));
    const path = process.env[PR_REVIEW_RECORDS_PATH_ENV] as string;
    expect(readPrReviewRecords(path).records).toHaveLength(0);
  });

  it('stamps partial coverage into the (hash-covered) record summary without breaking verification (#4140)', () => {
    const parsed = input({ prNumber: 77, baseSha: BASE_SHA });
    const outcome = persistReviewRecord({
      input: parsed,
      // A partial review degrades to abstain/verified:false per the C1 gate.
      aggregate: {
        decision: 'abstain',
        verified: false,
        reason: 'no_quorum: partial diff — 2 of 5 files reviewed',
      },
      counts: { approveCount: 3, requestChangesCount: 0, abstainCount: 0, errorCount: 0 },
      reviewCount: 3,
      logger,
      coverage: {
        reviewedFiles: 2,
        totalFiles: 5,
        droppedFiles: ['src/z.ts', 'src/w.ts', 'src/v.ts'],
        partial: true,
      },
    });
    expect(outcome.persisted).toBe(true);
    const path = process.env[PR_REVIEW_RECORDS_PATH_ENV] as string;
    const { records } = readPrReviewRecords(path);
    expect(records).toHaveLength(1);
    expect(records[0]?.summary).toContain('partial coverage: 2/5 files reviewed');
    // reviewedDiffHash basis is unchanged — still the canonical hash of prDiff.
    expect(records[0]?.reviewedDiffHash).toBe(computeReviewedDiffHash(parsed.prDiff));
    // The summary stamp is hash-covered, so verification still passes.
    expect(verifyPrReviewRecordSet(records).ok).toBe(true);
  });

  it('skips with reason=no-live-votes when every voter errored (no false gate pass)', () => {
    // An all-errored panel still aggregates to {abstain, verified:true}, but no
    // voter actually reviewed — persisting would write a gate-satisfying record
    // for a review that never happened (#4031 adversarial-review BLOCKER).
    const allErrored = {
      approveCount: 0,
      requestChangesCount: 0,
      abstainCount: 0,
      errorCount: 5,
    };
    const outcome = persistReviewRecord({
      input: input({ prNumber: 99, baseSha: BASE_SHA }),
      aggregate: APPROVE_AGG,
      counts: allErrored,
      reviewCount: 5,
      logger,
    });
    expect(outcome).toEqual(expect.objectContaining({ persisted: false, reason: 'no-live-votes' }));
    const path = process.env[PR_REVIEW_RECORDS_PATH_ENV] as string;
    expect(readPrReviewRecords(path).records).toHaveLength(0);
  });
});

describe('pr_review repoPath input (#4278)', () => {
  const BASE_SHA = 'd'.repeat(40);
  const APPROVE_AGG: PrReviewAggregate = { decision: 'approve', verified: true };
  const COUNTS = { approveCount: 5, requestChangesCount: 0, abstainCount: 0, errorCount: 0 };
  const logger = createLogger({ tool: 'pr-review-test' });

  it('is accepted by PrReviewInputSchema as an optional string', () => {
    const r = PrReviewInputSchema.safeParse({
      prTitle: 'x',
      prDiff: 'y',
      repoPath: '/some/repo/root',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.repoPath).toBe('/some/repo/root');
  });

  it('omits repoPath from parsed output when not supplied', () => {
    const r = PrReviewInputSchema.parse({ prTitle: 'x', prDiff: 'y' });
    expect(r.repoPath).toBeUndefined();
  });

  // #4278 root cause: resolvePrReviewRecordsPath() falls back to
  // findRepoRoot(process.cwd()), which returns null in an MCP server process
  // whose cwd has no `.git` ancestor — so the record silently fails to
  // persist. `repoPath` is the caller-supplied escape hatch. This test
  // exercises the FULL path: schema -> persistReviewRecord -> persistPrReviewRecord
  // -> resolvePrReviewRecordsPath, from a cwd with no `.git` ancestor and the
  // env override unset.
  //
  // #4312 security review (BLOCKING, addressed): `repoPath` is call-time input
  // from any MCP client, not operator-trust — it is only honored when it
  // resolves to a REAL repo root (`.git` ancestor), never as an arbitrary
  // writable directory.
  describe('end-to-end persistence with no .git ancestor in cwd', () => {
    let originalCwd: string;
    let originalEnv: string | undefined;
    let noGitDir: string;
    let repoRoot: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      originalEnv = process.env[PR_REVIEW_RECORDS_PATH_ENV];
      Reflect.deleteProperty(process.env, PR_REVIEW_RECORDS_PATH_ENV);
      noGitDir = mkdtempSync(join(tmpdir(), 'pr-review-repopath-no-git-'));
      repoRoot = mkdtempSync(join(tmpdir(), 'pr-review-repopath-root-'));
      // Give repoRoot a `.git` marker so it IS a real repo root (#4312).
      mkdirSync(join(repoRoot, '.git'));
      process.chdir(noGitDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      if (originalEnv === undefined)
        Reflect.deleteProperty(process.env, PR_REVIEW_RECORDS_PATH_ENV);
      else process.env[PR_REVIEW_RECORDS_PATH_ENV] = originalEnv;
      rmSync(noGitDir, { recursive: true, force: true });
      rmSync(repoRoot, { recursive: true, force: true });
    });

    it('persists to <repoPath>/governance/pr-review-records.jsonl when cwd has no .git ancestor and repoPath IS a real repo root', () => {
      const parsed = PrReviewInputSchema.parse({
        prTitle: 'Add repoPath escape hatch',
        prDiff: 'diff --git a/x b/x\n+line\n',
        simulate: false,
        prNumber: 4278,
        baseSha: BASE_SHA,
        repoPath: repoRoot,
      });

      const outcome = persistReviewRecord({
        input: parsed,
        aggregate: APPROVE_AGG,
        counts: COUNTS,
        reviewCount: 5,
        logger,
      });

      expect(outcome.persisted).toBe(true);
      const expectedPath = join(repoRoot, 'governance', 'pr-review-records.jsonl');
      const { records, invalidLines } = readPrReviewRecords(expectedPath);
      expect(invalidLines).toEqual([]);
      expect(records).toHaveLength(1);
      expect(records[0]?.prNumber).toBe(4278);
    });

    it('without repoPath, persistence is skipped (write-failed) — the #4278 bug reproduced', () => {
      const parsed = PrReviewInputSchema.parse({
        prTitle: 'No repoPath supplied',
        prDiff: 'diff --git a/x b/x\n+line\n',
        simulate: false,
        prNumber: 4279,
        baseSha: BASE_SHA,
      });

      const outcome = persistReviewRecord({
        input: parsed,
        aggregate: APPROVE_AGG,
        counts: COUNTS,
        reviewCount: 5,
        logger,
      });

      expect(outcome).toEqual(
        expect.objectContaining({ persisted: false, reason: 'write-failed' })
      );
    });

    it('#4312: a repoPath that is NOT a real repo root is ignored — never writes into it', () => {
      const notARepo = mkdtempSync(join(tmpdir(), 'pr-review-not-a-repo-'));
      try {
        const parsed = PrReviewInputSchema.parse({
          prTitle: 'Malicious repoPath',
          prDiff: 'diff --git a/x b/x\n+line\n',
          simulate: false,
          prNumber: 4280,
          baseSha: BASE_SHA,
          repoPath: notARepo,
        });

        const outcome = persistReviewRecord({
          input: parsed,
          aggregate: APPROVE_AGG,
          counts: COUNTS,
          reviewCount: 5,
          logger,
        });

        // cwd (noGitDir) also has no `.git` ancestor, so the resolver has
        // nothing left to fall through to — the write must be skipped, NOT
        // redirected into the arbitrary `notARepo` directory.
        expect(outcome).toEqual(
          expect.objectContaining({ persisted: false, reason: 'write-failed' })
        );
        const wouldBeArbitraryPath = join(notARepo, 'governance', 'pr-review-records.jsonl');
        expect(readPrReviewRecords(wouldBeArbitraryPath).records).toHaveLength(0);
      } finally {
        rmSync(notARepo, { recursive: true, force: true });
      }
    });
  });
});
