/**
 * Tests for supply_chain_tradeoff_panel MCP tool (#2294, child of #2293).
 *
 * Focused on pure logic: proposal construction, JSON parsing, per-axis
 * aggregation, panel-level decision rules. Voter integration is exercised
 * via the existing consensus-vote integration suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
  DEFAULT_AXES,
  FULL_PANEL,
  QUICK_PANEL,
  SupplyChainTradeoffPanelInputSchema,
  buildTradeoffProposal,
  parseAxisVerdicts,
  aggregateAxis,
  aggregatePanel,
  buildRecommendation,
  registerSupplyChainTradeoffPanelTool,
  type AxisVerdict,
  type PanelVote,
} from './supply-chain-tradeoff-panel.js';
import { VOTER_ROLES, type VoterRole } from '../../cli/vote-types.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { createLogger } from '../../core/index.js';

describe('supply_chain_tradeoff_panel', () => {
  describe('DEFAULT_AXES', () => {
    it('has the canonical 3 engineering-tradeoff axes', () => {
      expect(DEFAULT_AXES).toEqual([
        'build_time_determinism',
        'supply_chain_risk',
        'update_cadence',
      ]);
    });
  });

  describe('panels', () => {
    it('full panel covers every voter role including scope_steward', () => {
      expect(FULL_PANEL).toHaveLength(Object.keys(VOTER_ROLES).length);
      expect(new Set(FULL_PANEL).has('scope_steward')).toBe(true);
    });

    it('quick panel has 3 voters and includes scope_steward', () => {
      expect(QUICK_PANEL).toHaveLength(3);
      expect(QUICK_PANEL).toEqual(['architect', 'security', 'scope_steward']);
    });
  });

  describe('SupplyChainTradeoffPanelInputSchema', () => {
    it('accepts a minimal proposal with defaults', () => {
      const parsed = SupplyChainTradeoffPanelInputSchema.parse({ proposal: 'p' });
      expect(parsed.proposal).toBe('p');
      expect(parsed.quickMode).toBe(false);
      expect(parsed.simulate).toBe(false);
    });

    it('rejects proposal over MAX_PROPOSAL_LENGTH', () => {
      const long = 'x'.repeat(4001);
      expect(() => SupplyChainTradeoffPanelInputSchema.parse({ proposal: long })).toThrow();
    });

    it('rejects more than MAX_AXES axes', () => {
      const sevenAxes = Array.from({ length: 7 }, (_, i) => `axis_${String(i)}`);
      expect(() =>
        SupplyChainTradeoffPanelInputSchema.parse({ proposal: 'p', axes: sevenAxes })
      ).toThrow();
    });

    it('rejects empty axis name', () => {
      expect(() =>
        SupplyChainTradeoffPanelInputSchema.parse({ proposal: 'p', axes: [''] })
      ).toThrow();
    });

    it('defaults dispatch to sync and accepts async (#3731)', () => {
      expect(SupplyChainTradeoffPanelInputSchema.parse({ proposal: 'p' }).dispatch).toBe('sync');
      expect(
        SupplyChainTradeoffPanelInputSchema.parse({ proposal: 'p', dispatch: 'async' }).dispatch
      ).toBe('async');
      expect(() =>
        SupplyChainTradeoffPanelInputSchema.parse({ proposal: 'p', dispatch: 'bogus' })
      ).toThrow();
    });
  });

  describe('buildTradeoffProposal', () => {
    it('includes the proposal text and default axes', () => {
      const out = buildTradeoffProposal({ proposal: 'Adopt cargo-nextest?' });
      expect(out).toContain('Adopt cargo-nextest?');
      for (const axis of DEFAULT_AXES) expect(out).toContain(axis);
    });

    it('includes context when provided', () => {
      const out = buildTradeoffProposal({
        proposal: 'p',
        context: 'Repo currently uses cargo test; CI runs are 8 minutes.',
      });
      expect(out).toContain('Repo currently uses cargo test');
    });

    it('uses custom axes when provided', () => {
      const out = buildTradeoffProposal({
        proposal: 'p',
        axes: ['license_compatibility', 'maintainer_burden'],
      });
      expect(out).toContain('license_compatibility');
      expect(out).toContain('maintainer_burden');
      expect(out).not.toContain('build_time_determinism');
    });

    it('includes JSON output instructions', () => {
      const out = buildTradeoffProposal({ proposal: 'p' });
      expect(out).toContain('```json');
      expect(out).toContain('"axes"');
    });
  });

  describe('parseAxisVerdicts', () => {
    it('parses a fenced JSON block with axes', () => {
      const reasoning = `Reasoning here.\n\n\`\`\`json\n{\n  "axes": {\n    "build_time_determinism": {"decision": "approve", "reason": "Faster builds"},\n    "supply_chain_risk": {"decision": "reject", "reason": "Adds new trust root"},\n    "update_cadence": {"decision": "abstain", "reason": ""}\n  }\n}\n\`\`\``;
      const out = parseAxisVerdicts(reasoning, [...DEFAULT_AXES]);
      expect(out.build_time_determinism?.decision).toBe('approve');
      expect(out.supply_chain_risk?.decision).toBe('reject');
      expect(out.update_cadence?.decision).toBe('abstain');
    });

    it('falls back to bare JSON when no fence is present', () => {
      const reasoning = `Sure: { "axes": { "build_time_determinism": {"decision": "approve", "reason": "x"} } }`;
      const out = parseAxisVerdicts(reasoning, ['build_time_determinism']);
      expect(out.build_time_determinism?.decision).toBe('approve');
    });

    it('returns empty record when no JSON is present', () => {
      expect(parseAxisVerdicts('plain prose with no json', [...DEFAULT_AXES])).toEqual({});
    });

    it('returns empty record when JSON is invalid', () => {
      const reasoning = '```json\n{ broken }\n```';
      expect(parseAxisVerdicts(reasoning, [...DEFAULT_AXES])).toEqual({});
    });

    it('skips axes with invalid decision values', () => {
      const reasoning = `\`\`\`json\n{"axes": {"build_time_determinism": {"decision": "yolo"}}}\n\`\`\``;
      const out = parseAxisVerdicts(reasoning, ['build_time_determinism']);
      expect(out.build_time_determinism).toBeUndefined();
    });

    it('handles missing reason field by defaulting to empty string', () => {
      const reasoning = `\`\`\`json\n{"axes": {"build_time_determinism": {"decision": "approve"}}}\n\`\`\``;
      const out = parseAxisVerdicts(reasoning, ['build_time_determinism']);
      expect(out.build_time_determinism?.reason).toBe('');
    });

    it('only returns axes that match the requested axis list', () => {
      const reasoning = `\`\`\`json\n{"axes": {"a": {"decision": "approve"}, "b": {"decision": "reject"}}}\n\`\`\``;
      const out = parseAxisVerdicts(reasoning, ['a']);
      expect(out.a?.decision).toBe('approve');
      expect(out.b).toBeUndefined();
    });
  });

  describe('aggregateAxis', () => {
    const makeVote = (
      role: VoterRole,
      axisDecision: 'approve' | 'reject' | 'abstain',
      source: 'llm' | 'simulation' | 'error' = 'llm'
    ): PanelVote => ({
      role,
      overallDecision: axisDecision,
      axisVotes: { test_axis: { decision: axisDecision, reason: `${role}-reason` } },
      reasoning: '',
      source,
    });

    it('returns approve when majority approve', () => {
      const votes = [
        makeVote('architect', 'approve'),
        makeVote('security', 'approve'),
        makeVote('devex', 'reject'),
      ];
      const verdict = aggregateAxis('test_axis', votes);
      expect(verdict.decision).toBe('approve');
      expect(verdict.approveCount).toBe(2);
      expect(verdict.rejectCount).toBe(1);
      expect(verdict.supportingVoters).toEqual(['architect', 'security']);
    });

    it('returns reject when majority reject', () => {
      const votes = [
        makeVote('architect', 'reject'),
        makeVote('security', 'reject'),
        makeVote('devex', 'approve'),
      ];
      const verdict = aggregateAxis('test_axis', votes);
      expect(verdict.decision).toBe('reject');
    });

    it('returns mixed when approve == reject (tie)', () => {
      const votes = [makeVote('architect', 'approve'), makeVote('security', 'reject')];
      const verdict = aggregateAxis('test_axis', votes);
      expect(verdict.decision).toBe('mixed');
    });

    it('returns unknown when no valid votes', () => {
      const verdict = aggregateAxis('test_axis', []);
      expect(verdict.decision).toBe('unknown');
      expect(verdict.confidence).toBe(0);
    });

    it('excludes errored voters from counts', () => {
      const votes = [
        makeVote('architect', 'approve'),
        makeVote('security', 'approve'),
        makeVote('devex', 'reject', 'error'),
      ];
      const verdict = aggregateAxis('test_axis', votes);
      expect(verdict.approveCount).toBe(2);
      expect(verdict.rejectCount).toBe(0);
    });

    it('skips voters that did not emit this axis', () => {
      const noAxisVote: PanelVote = {
        role: 'architect',
        overallDecision: 'approve',
        axisVotes: {},
        reasoning: '',
        source: 'llm',
      };
      const withAxis = {
        role: 'security' as const,
        overallDecision: 'approve' as const,
        axisVotes: { test_axis: { decision: 'approve' as const, reason: 'r' } },
        reasoning: '',
        source: 'llm' as const,
      };
      const verdict = aggregateAxis('test_axis', [noAxisVote, withAxis]);
      expect(verdict.approveCount).toBe(1);
    });

    it('computes confidence as max-decision / total', () => {
      const votes = [
        makeVote('architect', 'approve'),
        makeVote('security', 'approve'),
        makeVote('devex', 'approve'),
        makeVote('catfish', 'reject'),
      ];
      const verdict = aggregateAxis('test_axis', votes);
      expect(verdict.confidence).toBeCloseTo(0.75, 2);
    });

    it('builds summary from up to 3 reasons', () => {
      const votes = [
        makeVote('architect', 'approve'),
        makeVote('security', 'approve'),
        makeVote('devex', 'approve'),
        makeVote('catfish', 'approve'),
      ];
      const verdict = aggregateAxis('test_axis', votes);
      const sepCount = verdict.summary.split(' | ').length;
      expect(sepCount).toBeLessThanOrEqual(3);
    });
  });

  describe('aggregatePanel', () => {
    const verdict = (axis: string, decision: AxisVerdict['decision']): AxisVerdict => ({
      axis,
      decision,
      confidence: 1,
      approveCount: 0,
      rejectCount: 0,
      abstainCount: 0,
      summary: '',
      supportingVoters: [],
    });

    it('returns approve only when ALL axes approve', () => {
      expect(
        aggregatePanel([verdict('a', 'approve'), verdict('b', 'approve'), verdict('c', 'approve')])
      ).toBe('approve');
    });

    it('returns reject when ANY axis rejects', () => {
      expect(
        aggregatePanel([verdict('a', 'approve'), verdict('b', 'reject'), verdict('c', 'approve')])
      ).toBe('reject');
    });

    it('returns mixed when axes are split between approve and mixed/unknown', () => {
      expect(
        aggregatePanel([verdict('a', 'approve'), verdict('b', 'mixed'), verdict('c', 'unknown')])
      ).toBe('mixed');
    });

    it('returns mixed for an empty verdict list', () => {
      expect(aggregatePanel([])).toBe('mixed');
    });

    it('a single reject overrides several approves', () => {
      expect(
        aggregatePanel([
          verdict('a', 'approve'),
          verdict('b', 'approve'),
          verdict('c', 'approve'),
          verdict('d', 'reject'),
        ])
      ).toBe('reject');
    });
  });

  describe('buildRecommendation', () => {
    const v = (axis: string, decision: AxisVerdict['decision']): AxisVerdict => ({
      axis,
      decision,
      confidence: 1,
      approveCount: 1,
      rejectCount: 0,
      abstainCount: 0,
      summary: '',
      supportingVoters: [],
    });

    it('approve recommendation cites axis count', () => {
      const out = buildRecommendation('approve', [v('a', 'approve'), v('b', 'approve')]);
      expect(out).toContain('all 2 axes');
    });

    it('reject recommendation names blocking axes', () => {
      const out = buildRecommendation('reject', [v('a', 'approve'), v('b', 'reject')]);
      expect(out).toContain('b');
      expect(out.toLowerCase()).toContain('reject');
    });

    it('mixed recommendation lists wins and concerns', () => {
      const out = buildRecommendation('mixed', [v('a', 'approve'), v('b', 'mixed')]);
      expect(out).toContain('a');
      expect(out).toContain('b');
      expect(out.toLowerCase()).toContain('mixed');
    });
  });
});

// #3731: async dispatch mode. The up-to-7-voter live fan-out can exceed the MCP
// request timeout, so `dispatch: 'async'` returns a jobId immediately and runs
// the panel in the background (poll get_job_result). This tool has no sessionId,
// so a fresh `sc-<uuid>` jobId is always minted (no idempotency surface).
interface HandlerCtx {
  logger: ReturnType<typeof createLogger>;
}
type CtxHandler = (args: unknown, ctx: HandlerCtx) => Promise<CapturedToolResult>;

interface CapturedToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

const TEST_CTX: HandlerCtx = { logger: createLogger({ tool: 'supply_chain_tradeoff_panel.test' }) };

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
  registerSupplyChainTradeoffPanelTool(mockServer as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  expect(registeredName).toBe('supply_chain_tradeoff_panel');
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

describe('supply_chain_tradeoff_panel async dispatch (#3731)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  function envelope(result: CapturedToolResult): Record<string, unknown> {
    return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
  }

  // simulate:true + quickMode keeps the panel body fast + deterministic.
  const ASYNC_ARGS = {
    proposal: 'Should we adopt dep X?',
    simulate: true,
    quickMode: true,
    dispatch: 'async',
  } as const;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-sc-async-'));
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

  it("returns { status: 'pending', jobId } and mints an sc-<uuid> id", async () => {
    const handler = captureHandler();
    const env = envelope(await handler(ASYNC_ARGS, TEST_CTX));
    expect(env['status']).toBe('pending');
    expect(typeof env['jobId']).toBe('string');
    expect(env['jobId'] as string).toMatch(/^sc-/);
    expect(env['pollTool']).toBe('get_job_result');
  });

  it('runs the panel inline (sync) by default — no pending envelope', async () => {
    const handler = captureHandler();
    const env = envelope(
      await handler(
        { proposal: 'Should we adopt dep X?', simulate: true, quickMode: true },
        TEST_CTX
      )
    );
    expect(env['status']).toBeUndefined();
    expect(env['decision']).toBeDefined();
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
