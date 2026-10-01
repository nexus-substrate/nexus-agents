import { describe, expect, it } from 'vitest';

import { summarizeConsensusDecisionTokens } from './consensus-decision-tokens.js';
import { isPipelineRunId, pipelineRunId } from '../pipeline/pipeline-run-id.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import { rollupDecisionCost } from './decision-cost.js';

function row(
  traceId?: string,
  success = true,
  source: TaskOutcome['source'] = 'delegate'
): TaskOutcome {
  return {
    id: 'stage-row',
    cli: 'claude',
    category: 'planning',
    model: 'test-model',
    success,
    source,
    durationMs: 10,
    timestamp: '2026-10-01T00:00:00.000Z',
    ...(traceId !== undefined ? { traceId } : {}),
  };
}

describe('pipeline outcome join coverage (#6867)', () => {
  it('counts each traced run once, including failed stage outcomes', () => {
    const a = pipelineRunId('a');
    const b = pipelineRunId('b');
    const report = summarizeConsensusDecisionTokens(
      [],
      [],
      [row(a), row(a, false), row(b, false)],
      [a, b, pipelineRunId('missing'), a]
    );
    expect(report).toMatchObject({
      matchedPipelineRuns: 2,
      matchedPipelineOutcomeRows: 3,
      unmatchedPipelineOutcomeRows: 0,
    });
    expect(report.pipelineOutcomeJoinCoverage).toBeCloseTo(2 / 3);
  });

  it('counts canonical pipeline rows without a traced run as unmatched', () => {
    const report = summarizeConsensusDecisionTokens(
      [],
      [],
      [row(pipelineRunId('orphan'))],
      [pipelineRunId('known')]
    );
    expect(report).toMatchObject({
      matchedPipelineRuns: 0,
      matchedPipelineOutcomeRows: 0,
      unmatchedPipelineOutcomeRows: 1,
      pipelineOutcomeJoinCoverage: 0,
    });
  });

  it('keeps mixed consensus and pipeline measurements independent', () => {
    const record = {
      decisionId: 'decision',
      gate: 'consensus_vote' as const,
      timestamp: '2026-10-01T00:00:00.000Z',
      summary: rollupDecisionCost(
        [{ role: 'architect', model: 'test-model', inputTokens: 1, outputTokens: 0 }],
        'plan'
      ),
    };
    const run = pipelineRunId('joined');
    const report = summarizeConsensusDecisionTokens(
      [record],
      [{ correlationId: 'decision', decision: 'approved' }],
      [
        row('decision', true, 'consensus'),
        row(run),
        row(pipelineRunId('orphan')),
        row('ordinary-delegate'),
        row(),
      ],
      [run]
    );
    expect(report).toMatchObject({
      matchedOutcomeRows: 1,
      unmatchedOutcomeRows: 0,
      outcomeJoinCoverage: 1,
      matchedPipelineRuns: 1,
      matchedPipelineOutcomeRows: 1,
      unmatchedPipelineOutcomeRows: 1,
      pipelineOutcomeJoinCoverage: 1,
    });
  });

  it.each([
    { name: 'empty', rows: [] },
    { name: 'ordinary delegate', rows: [row('ordinary-delegate')] },
    { name: 'legacy delegate', rows: [row()] },
    { name: 'empty session', rows: [row(pipelineRunId(''))] },
  ])('reports total loss of pipeline outcome recording as zero: $name', ({ rows }) => {
    expect(summarizeConsensusDecisionTokens([], [], rows, [pipelineRunId('known')])).toMatchObject({
      matchedPipelineRuns: 0,
      matchedPipelineOutcomeRows: 0,
      unmatchedPipelineOutcomeRows: 0,
      pipelineOutcomeJoinCoverage: 0,
    });
  });

  it('reports pipeline rows without measured runs as unmatched with null coverage', () => {
    expect(summarizeConsensusDecisionTokens([], [], [row(pipelineRunId('orphan'))])).toMatchObject({
      matchedPipelineRuns: 0,
      unmatchedPipelineOutcomeRows: 1,
      pipelineOutcomeJoinCoverage: null,
    });
  });

  it.each([{ rows: [] }, { rows: [row('ordinary-delegate')] }, { rows: [row()] }])(
    'reports no traced runs as unmeasured even with unrelated rows: %j',
    ({ rows }) => {
      expect(summarizeConsensusDecisionTokens([], [], rows).pipelineOutcomeJoinCoverage).toBeNull();
    }
  );

  it('reports the entirely empty cohort as unmeasured', () => {
    expect(summarizeConsensusDecisionTokens([], []).pipelineOutcomeJoinCoverage).toBeNull();
  });

  it('keeps legacy pipeline stages without canonical trace IDs unmatched', () => {
    const rows = [
      { ...row(), model: 'pipeline' },
      { ...row('invalid-run'), model: 'pipeline' },
    ];
    expect(summarizeConsensusDecisionTokens([], [], rows, [pipelineRunId('known')])).toMatchObject({
      matchedPipelineRuns: 0,
      unmatchedPipelineOutcomeRows: 2,
      pipelineOutcomeJoinCoverage: 0,
    });
  });

  it('ignores non-pipeline run IDs in the denominator', () => {
    const run = pipelineRunId('joined');
    expect(
      summarizeConsensusDecisionTokens([], [], [row(run)], [run, 'graph-run', pipelineRunId('')])
        .pipelineOutcomeJoinCoverage
    ).toBe(1);
  });

  it.each(['pipeline-', 'pipeline-a/b', 'pipeline-a.b', 'pipeline-' + 's'.repeat(129)])(
    'rejects IDs outside the session contract: %s',
    (id) => {
      expect(isPipelineRunId(id)).toBe(false);
    }
  );

  it('counts a run only while its id still fits an outcome traceId', () => {
    // Prefix 'pipeline-' (9) + 119 = 128 = TRACE_ID_MAX_LENGTH; one more could never join.
    expect(isPipelineRunId(pipelineRunId('s'.repeat(119)))).toBe(true);
    expect(isPipelineRunId(pipelineRunId('s'.repeat(120)))).toBe(false);
  });

  it('recognizes the exact output for supported explicit and generated sessions', () => {
    expect(isPipelineRunId(pipelineRunId('x'))).toBe(true);
    expect(isPipelineRunId(pipelineRunId('dp-12345678-1234-1234-1234-123456789abc'))).toBe(true);
  });
});
