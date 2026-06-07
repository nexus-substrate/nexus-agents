/**
 * Tests for supply_chain_tradeoff_panel MCP tool (#2294, child of #2293).
 *
 * Focused on pure logic: proposal construction, JSON parsing, per-axis
 * aggregation, panel-level decision rules. Voter integration is exercised
 * via the existing consensus-vote integration suite.
 */

import { describe, it, expect } from 'vitest';
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
  type AxisVerdict,
  type PanelVote,
} from './supply-chain-tradeoff-panel.js';
import { VOTER_ROLES, type VoterRole } from '../../cli/vote-types.js';

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
  });

  describe('buildTradeoffProposal', () => {
    it('includes the proposal text and default axes', () => {
      const out = buildTradeoffProposal({
        proposal: 'Adopt cargo-nextest?',
        quickMode: false,
        simulate: false,
      });
      expect(out).toContain('Adopt cargo-nextest?');
      for (const axis of DEFAULT_AXES) expect(out).toContain(axis);
    });

    it('includes context when provided', () => {
      const out = buildTradeoffProposal({
        proposal: 'p',
        context: 'Repo currently uses cargo test; CI runs are 8 minutes.',
        quickMode: false,
        simulate: false,
      });
      expect(out).toContain('Repo currently uses cargo test');
    });

    it('uses custom axes when provided', () => {
      const out = buildTradeoffProposal({
        proposal: 'p',
        axes: ['license_compatibility', 'maintainer_burden'],
        quickMode: false,
        simulate: false,
      });
      expect(out).toContain('license_compatibility');
      expect(out).toContain('maintainer_burden');
      expect(out).not.toContain('build_time_determinism');
    });

    it('includes JSON output instructions', () => {
      const out = buildTradeoffProposal({ proposal: 'p', quickMode: false, simulate: false });
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
