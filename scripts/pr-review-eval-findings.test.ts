import { describe, expect, it, vi } from 'vitest';
import {
  scoreCaseVoters,
  type PanelFinding,
  type ScoreCaseInput,
} from './pr-review-eval-run-core.js';
import {
  VoterEvalVerdictSchema,
  type VoterEvalVerdict,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-eval-types.js';
import { collectRealVotes } from '../packages/nexus-agents/src/cli/voter-agents.js';
import { livePanelRunner } from './pr-review-eval-run.js';

vi.mock('../packages/nexus-agents/src/cli/voter-agents.js', () => ({ collectRealVotes: vi.fn() }));

const gate = {
  reread_cited_line: 'passed',
  traced_call_path: 'passed',
  named_assertion: 'throws on null input',
  ruled_out_language_non_issue: 'passed',
} as const;
const raw = {
  summary: 'Null dereference',
  location: 'src/foo.ts:10',
  severity: 'high',
  claim: 'Null input reaches this dereference.',
  gate,
  verified: true,
} as const;
const input: ScoreCaseInput = {
  runId: 'r',
  caseNumber: 'c',
  caseClass: 'buggy',
  knownBugs: [
    {
      summary: 'Null dereference',
      location: 'src/foo.ts:10',
      severity: 'high',
      locationTolerance: 'line',
      fixReference: 'fixture',
    },
    {
      summary: 'Missed leak',
      location: 'src/other.ts:20',
      severity: 'medium',
      locationTolerance: 'line',
      fixReference: 'fixture',
    },
  ],
  rubricVersion: '1',
  timestamp: '2026-10-01T00:00:00Z',
};

function score(
  findings: readonly PanelFinding[],
  overrides: Partial<ScoreCaseInput> = {}
): VoterEvalVerdict {
  const [verdict] = scoreCaseVoters({ ...input, ...overrides }, [
    { role: 'security', decision: 'request_changes', findings, source: 'llm' },
  ]);
  if (verdict === undefined) throw new Error('Expected a scored voter');
  return verdict;
}

describe('eval finding evidence (#4339)', () => {
  it('producer carries the real findings it counted, plus missed ground truth', () => {
    const v = score([raw]);
    expect(v.findings).toEqual([
      {
        summary: raw.summary,
        location: raw.location,
        severity: raw.severity,
        rationale: raw.claim,
        gate,
        verified: true,
        source: 'voter',
        findingIndex: 0,
        classification: 'TP',
        knownBugIndex: 0,
      },
      {
        summary: 'Missed leak',
        location: 'src/other.ts:20',
        severity: 'medium',
        source: 'ground_truth',
        classification: 'FN',
        knownBugIndex: 1,
      },
    ]);
    for (const [classification, count] of [
      ['TP', v.truePositives],
      ['FP', v.falsePositives],
      ['FN', v.falseNegatives],
    ] as const)
      expect(v.findings?.filter((f) => f.classification === classification)).toHaveLength(count);
    expect(v.findingsTruncated).toBe(0);
  });

  it('preserves clean false positives, unverified flags, and borderline exclusions', () => {
    const unverified = { ...raw, verified: false };
    const v = score([raw, unverified], { caseClass: 'clean', knownBugs: [] });
    expect(v.falsePositives).toBe(1);
    expect(v.findings?.map((f) => f.classification)).toEqual(['FP', 'excluded']);
    expect(v.findings?.[1]?.gate).toEqual(gate);
    expect(
      score([raw], { caseClass: 'borderline', knownBugs: [] }).findings?.[0]?.classification
    ).toBe('excluded');
  });

  it('deduplicates catches without losing duplicate or nonmatching raw flags', () => {
    const v = score([raw, raw, { ...raw, location: 'noise.ts:1' }]);
    expect(v.truePositives).toBe(1);
    expect(v.findings?.map((f) => f.classification)).toEqual(['TP', 'excluded', 'excluded', 'FN']);
    expect(v.findings?.filter((f) => f.source === 'voter')).toHaveLength(3);
    expect(v.findings?.map((f) => f.findingIndex)).toEqual([0, 1, 2, undefined]);
  });

  it('records each counted bug when one finding matches overlapping known bugs', () => {
    const v = score([raw], { knownBugs: [input.knownBugs[0]!, input.knownBugs[0]!] });
    expect(v.truePositives).toBe(2);
    expect(v.findings?.map((f) => [f.classification, f.knownBugIndex, f.findingIndex])).toEqual([
      ['TP', 0, 0],
      ['TP', 1, 0],
    ]);
  });

  it('names the empty finding case', () => {
    expect(score([], { caseClass: 'clean', knownBugs: [] })).toMatchObject({
      findings: [],
      findingsTruncated: 0,
      falsePositives: 0,
    });
  });

  it('caps entries at 100 with an explicit omitted count while keeping full tallies', () => {
    const v = score(
      Array.from({ length: 103 }, () => raw),
      { caseClass: 'clean', knownBugs: [] }
    );
    expect(v.findings).toHaveLength(100);
    expect(v.findingsTruncated).toBe(3);
    expect(v.falsePositives).toBe(103);
    expect(VoterEvalVerdictSchema.safeParse(v).success).toBe(true);
    expect(
      score(
        Array.from({ length: 100 }, () => raw),
        { caseClass: 'clean', knownBugs: [] }
      ).findingsTruncated
    ).toBe(0);
  });

  it('bounds text and explicitly names every shortened field', () => {
    const v = score(
      [
        {
          ...raw,
          summary: 's'.repeat(501),
          location: 'l'.repeat(201),
          claim: 'r'.repeat(2001),
          gate: { ...gate, named_assertion: 'a'.repeat(2001) },
        },
      ],
      { caseClass: 'clean', knownBugs: [] }
    );
    const f = v.findings?.[0];
    expect(f?.summary).toHaveLength(500);
    expect(f?.location).toHaveLength(200);
    expect(f?.rationale).toHaveLength(2000);
    expect(f?.gate?.named_assertion).toHaveLength(2000);
    expect(f?.truncatedFields).toEqual([
      'summary',
      'location',
      'rationale',
      'gate.named_assertion',
    ]);
    expect(VoterEvalVerdictSchema.safeParse(v).success).toBe(true);
  });

  it('live producer retains claim and every gate field from real vote results', async () => {
    vi.mocked(collectRealVotes).mockResolvedValue([
      {
        role: 'security',
        source: 'llm',
        processingTimeMs: 1,
        vote: {
          decision: 'reject',
          reasoning: 'Concrete finding',
          confidence: 0.9,
          findings: [raw],
        },
      },
    ]);
    const outcomes = await livePanelRunner({
      caseNumber: 'c',
      title: 'test',
      description: '',
      diff: '+bug',
    });
    expect(outcomes[0]?.findings[0]).toEqual(raw);
    expect(scoreCaseVoters(input, outcomes)[0]?.findings?.[0]?.rationale).toBe(raw.claim);
  });
});
