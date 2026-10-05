/** End-to-end matrix for the owner-sample model, including persisted panel verification. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runPanelJudge } from '../../cli/remediation-review-panel.js';
import { parseCliArgs } from '../../cli.js';

const { executeVoting } = vi.hoisted(() => ({ executeVoting: vi.fn() }));
vi.mock('./consensus-vote.js', () => ({ executeVoting }));
import { buildVoteRecord } from '../../audit/vote-record-store.js';
import { buildRemediationPanelProposal } from './remediation-review-proposal.js';
import {
  RemediationSoakRecordSchema,
  summarizeRemediationSoak,
  getRemediationSoakFile,
  type RemediationSoakRecord,
} from './improvement-remediation-shadow.js';
import {
  hashSoakRecordLine,
  soakRefOf,
  readRemediationReviewSummary,
  type ReviewRecord,
} from './remediation-review.js';
import { drawRemediationReviewSample, type ReviewSample } from './remediation-review-sample.js';
import { buildEnforceReadinessEvidence } from './remediation-readiness-collector.js';
import {
  DEFAULT_ENFORCE_READINESS_CONFIG,
  evaluateEnforceReadiness,
} from './improvement-enforce-readiness.js';

const time = (hour: number): string => `2026-10-01T${String(hour).padStart(2, '0')}:00:00.000Z`;
const agreement = '1 of 1 owner sample judgments (need ≥ 1); 0 disagreements (allow ≤ 0)';
const unresolved = '1 unresolved owner disagreements (allow ≤ 0)';
const na = 'n/a — no current panel judgments';
const moot = `${na}; 1 moot owner disagreements on superseded panel refs`;
const override = '1 panel rejections overridden by human; 1 without owner confirmation';

type Step =
  | 'agree'
  | 'disagree'
  | 'non-owner'
  | 'annotation'
  | 'legacy-non-owner'
  | 'missing-annotation'
  | 'same-owner-redraw'
  | 'redraw'
  | 'human'
  | 'confirm'
  | 'reject-human'
  | 'human-at-prior-mark-time'
  | 'confirm-at-prior-human-time'
  | 'new-panel'
  | 'stale'
  | 'partial'
  | 'panel-reject'
  | 'invalid-active'
  | 'invalid-superseded';
interface MatrixRow {
  name: string;
  steps: readonly Step[];
  ready: boolean;
  detail: string;
  rejected?: boolean;
  replacementRejected?: boolean;
  base?: 'empty' | 'human';
}
const matrix: readonly MatrixRow[] = [
  { name: 'single sample agree', steps: ['agree'], ready: true, detail: agreement },
  { name: 'single sample disagree', steps: ['disagree'], ready: false, detail: unresolved },
  {
    name: 'disagree then same owner agrees',
    steps: ['disagree', 'agree'],
    ready: true,
    detail: agreement,
  },
  {
    name: 'disagree then non-owner marks same sample',
    steps: ['disagree', 'non-owner'],
    ready: false,
    detail: unresolved,
  },
  {
    name: 'disagree then another owner sample agrees same ref',
    steps: ['disagree', 'redraw', 'agree'],
    ready: false,
    detail: unresolved,
  },
  {
    name: 'all panels superseded with prior owner agreement',
    steps: ['agree', 'human'],
    ready: true,
    detail: na,
  },
  {
    name: 'all panels superseded with prior disagreement is moot',
    steps: ['disagree', 'human'],
    ready: true,
    detail: moot,
  },
  {
    name: 'rejection overridden without owner confirmation',
    rejected: true,
    steps: ['human'],
    ready: false,
    detail: override,
  },
  {
    name: 'rejection overridden with owner confirmation',
    rejected: true,
    steps: ['human', 'confirm'],
    ready: true,
    detail: `${na}; 1 panel rejections overridden by human; all owner-confirmed`,
  },
  { name: 'empty store', base: 'empty', steps: [], ready: false, detail: na },
  { name: 'all-human store', base: 'human', steps: [], ready: true, detail: na },
  {
    name: 'unverifiable active row',
    steps: ['invalid-active'],
    ready: false,
    detail:
      '1 unverifiable panel rows: testing:coverage::2026-10-01T00:00:00.000Z: record id not found: absent; re-judge the ref by a human or re-run panel-judge',
  },
  {
    name: 'unverifiable superseded row',
    steps: ['invalid-superseded', 'human'],
    ready: true,
    detail: na,
  },
  {
    name: 'owner annotation is irrelevant to agreement',
    steps: ['disagree', 'annotation'],
    ready: true,
    detail: agreement,
  },
  {
    name: 'human agreement before override cannot confirm rejection',
    rejected: true,
    steps: ['agree', 'human'],
    ready: false,
    detail: override,
  },
  { name: 'human outranks later panel', steps: ['human', 'new-panel'], ready: true, detail: na },
  {
    name: 'stale sample names freshness cause',
    steps: ['agree', 'stale'],
    ready: false,
    detail: 'stale owner sample — drawn before or at the latest panel judgment',
  },
  {
    name: 'partial sample names missing judgments',
    steps: ['partial'],
    ready: false,
    detail: '0 of 1 owner sample judgments (need ≥ 1); 0 disagreements (allow ≤ 0)',
  },
  {
    name: 'human override agreement resolves same-sample disagreement',
    rejected: true,
    steps: ['disagree', 'human', 'confirm'],
    ready: true,
    detail: `${na}; 1 panel rejections overridden by human; all owner-confirmed`,
  },
  {
    name: 'owner confirmation before human rejudgment is insufficient',
    rejected: true,
    steps: ['disagree', 'human'],
    ready: false,
    detail: override,
  },
  {
    name: 'same owner redraw cannot resolve original disagreement',
    steps: ['disagree', 'same-owner-redraw', 'agree'],
    ready: false,
    detail: unresolved,
  },
  {
    name: 'two samples disagree on one ref independently',
    steps: ['disagree', 'redraw', 'disagree'],
    ready: false,
    detail: '2 unresolved owner disagreements (allow ≤ 0)',
  },
  {
    name: 'missing owner annotation still resolves same sample',
    steps: ['disagree', 'missing-annotation'],
    ready: true,
    detail: agreement,
  },
  {
    name: 'legacy non-owner sample mark cannot supersede panel',
    steps: ['disagree', 'legacy-non-owner'],
    ready: false,
    detail: unresolved,
  },
  {
    name: 'confirmation before human at tied timestamp is insufficient',
    rejected: true,
    steps: ['confirm', 'human-at-prior-mark-time'],
    ready: false,
    detail: override,
  },
  {
    name: 'confirmation after human at tied timestamp is valid',
    rejected: true,
    steps: ['human', 'confirm-at-prior-human-time'],
    ready: true,
    detail: `${na}; 1 panel rejections overridden by human; all owner-confirmed`,
  },

  {
    name: 'later owner rejection revokes same-sample confirmation',
    rejected: true,
    steps: ['human', 'confirm', 'reject-human'],
    ready: false,
    detail: override,
  },

  {
    name: 'owner disagrees with changed backdated current panel',
    replacementRejected: true,
    steps: ['panel-reject', 'agree'],
    ready: false,
    detail: unresolved,
  },
];

function fixture(
  dir: string,
  rejected: boolean,
  content: Partial<RemediationSoakRecord> = {},
  index = 0
): { panel: ReviewRecord; raw: string } {
  const raw = JSON.stringify(
    RemediationSoakRecordSchema.parse({
      signalKey: index === 0 ? 'testing:coverage' : `testing:coverage:${String(index)}`,
      timestamp: time(0),
      category: 'testing',
      priority: 'p2',
      severity: 'warning',
      signalTitle: 'Missing regression coverage',
      signalDescription: 'The owner review flow lacks a regression test.',
      signalEvidence: { samples: 5, observedValue: 0, threshold: 1 },
      planSteps: [{ kind: 'add-test', description: 'Cover owner review readiness' }],
      planStepCount: 1,
      reason: 'review matrix',
      voteOutcome: { approved: true, approvalPercentage: 100 },
      ...content,
    })
  );
  const proposal = buildRemediationPanelProposal(raw);
  const decision = rejected ? 'rejected' : 'approved';
  const vote = buildVoteRecord({
    id: 'vote',
    proposal,
    strategy: 'higher_order',
    declaredOptions: undefined,
    resolvedDecision: decision,
    errorPolicy: 'absolute_quorum',
    votes: [
      {
        role: 'architect',
        source: 'llm',
        processingTimeMs: 10,
        vote: {
          decision: rejected ? 'reject' : 'approve',
          confidence: 1,
          reasoning: 'Artifact reviewed',
        },
      },
    ],
    result: {
      proposalId: 'proposal',
      proposal: { title: 'Review', description: proposal, algorithm: 'higher_order' },
      outcome: decision,
      votes: new Map(),
      voteCounts: { approve: rejected ? 0 : 1, reject: rejected ? 1 : 0, abstain: 0, total: 1 },
      approvalPercentage: rejected ? 0 : 100,
      quorumReached: true,
      startedAt: time(1),
      closedAt: time(1),
      durationMs: 10,
    },
  });
  const path = join(dir, `votes-${String(index)}.jsonl`);
  writeFileSync(path, JSON.stringify(vote) + '\n');
  return {
    raw,
    panel: {
      judgeKind: 'panel',
      soakRef: soakRefOf(RemediationSoakRecordSchema.parse(JSON.parse(raw))),
      reviewedAt: time(1),
      reviewed: true,
      sound: !rejected,
      evaluator: 'panel:vote',
      voteRecordId: 'vote',
      voteLedgerPath: path,
      soakRecordHash: hashSoakRecordLine(raw),
    },
  };
}

function scenario(
  row: MatrixRow,
  panel: ReviewRecord
): { records: ReviewRecord[]; samples: ReviewSample[] } {
  const human: ReviewRecord = {
    ...panel,
    judgeKind: 'human',
    sound: true,
    evaluator: 'Human',
    owner: 'Owner',
    ownerSignedOff: true,
  };
  const records = row.base === 'empty' ? [] : [row.base === 'human' ? human : panel];
  const samples: ReviewSample[] =
    row.base === undefined
      ? [
          {
            ...drawRemediationReviewSample([panel], 1, 'Owner', 'seed'),
            id: 'original',
            sampledAt: time(2),
          },
        ]
      : [];
  row.steps.forEach((step, index) => {
    const sample = samples.at(-1)!;
    const mark: ReviewRecord = {
      judgeKind: 'owner-sample',
      sampleId: sample?.id,
      soakRef: panel.soakRef,
      reviewedAt: time(index + 3),
      reviewed: true,
      sound: true,
      evaluator: sample?.owner ?? 'Owner',
      owner: sample?.owner ?? 'Owner',
      ownerSignedOff: true,
    };
    applyStep(step, { panel, human, mark, records, samples });
  });
  return { records, samples };
}

interface ScenarioState {
  panel: ReviewRecord;
  human: ReviewRecord;
  mark: ReviewRecord;
  records: ReviewRecord[];
  samples: ReviewSample[];
}
function applyStep(step: Step, state: ScenarioState): void {
  const { panel, human, mark, records, samples } = state;
  const sample = samples.at(-1)!;
  const invalid = (): void => {
    records[0] = { ...panel, voteRecordId: 'absent', evaluator: 'panel:absent' };
  };
  const actions: Record<Step, () => unknown> = {
    agree: () => records.push({ ...mark, sound: panel.sound }),
    confirm: () => records.push(mark),
    disagree: () => records.push({ ...mark, sound: !panel.sound }),
    'legacy-non-owner': () => records.push({ ...mark, judgeKind: 'human', evaluator: 'Non-owner' }),
    'missing-annotation': () => records.push({ ...mark, sound: panel.sound, owner: undefined }),
    'same-owner-redraw': () =>
      samples.push({ ...sample, id: 'redraw', sampledAt: mark.reviewedAt }),
    'reject-human': () => records.push({ ...mark, sound: false }),
    'non-owner': () => records.push({ ...mark, evaluator: 'Non-owner' }),
    annotation: () => records.push({ ...mark, sound: panel.sound, owner: 'Unrelated annotation' }),
    redraw: () =>
      samples.push({ ...sample, id: 'redraw', owner: 'Other owner', sampledAt: mark.reviewedAt }),
    'human-at-prior-mark-time': () =>
      records.push({ ...human, reviewedAt: records.at(-1)!.reviewedAt }),
    'confirm-at-prior-human-time': () =>
      records.push({ ...mark, reviewedAt: records.at(-1)!.reviewedAt }),
    human: () => records.push({ ...human, reviewedAt: mark.reviewedAt }),
    'panel-reject': () => records.push({ ...panel, sound: false }),
    'new-panel': () => records.push({ ...panel, reviewedAt: mark.reviewedAt }),
    stale: () => {
      samples[0] = { ...sample, sampledAt: time(1) };
    },
    partial: () => undefined,
    'invalid-active': invalid,
    'invalid-superseded': invalid,
  };
  actions[step]();
}

describe('owner-sample readiness model matrix', () => {
  it.each(matrix)('$name', (row) => {
    const dir = mkdtempSync(join(tmpdir(), 'owner-model-'));
    try {
      const { panel, raw } = fixture(dir, row.rejected ?? false);
      if (row.replacementRejected === true) fixture(dir, true);
      const { records, samples } = scenario(row, panel);
      const summary = readRemediationReviewSummary(
        { getRecords: () => records, record: () => false },
        { getRecords: () => samples, record: () => false },
        [raw]
      );
      const evidence = buildEnforceReadinessEvidence(
        summarizeRemediationSoak(
          row.base === 'empty' ? [] : [RemediationSoakRecordSchema.parse(JSON.parse(raw))]
        ),
        summary
      );
      const verdict = evaluateEnforceReadiness(evidence, {
        ...DEFAULT_ENFORCE_READINESS_CONFIG,
        minShadowSelections: 1,
        minJudgedRate: 1,
        minOwnerSample: 1,
        requireNamedOwner: false, // Isolate agreement identity from the separate sign-off gate.
      });
      expect(verdict.ready).toBe(row.ready);
      expect(
        verdict.criteria.find((criterion) => criterion.name === 'owner-agreement')?.detail
      ).toBe(row.detail);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

it('preserves tied judgment order through verification of a sign-off copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'owner-order-'));
  try {
    const { panel, raw } = fixture(dir, true);
    const { records, samples } = scenario(
      {
        name: 'sign-off source',
        rejected: true,
        steps: ['human', 'confirm-at-prior-human-time'],
        ready: true,
        detail: na,
      },
      panel
    );
    const human = records.find((row) => row.judgeKind === 'human')!;
    records[records.indexOf(human)] = { ...human, ownerSignedOff: false };
    records.push({ ...human, ownerSignedOff: true });
    const summary = readRemediationReviewSummary(
      { getRecords: () => records, record: () => false },
      { getRecords: () => samples, record: () => false },
      [raw]
    );
    expect(summary.sample.n).toBe(1);
    expect(summary.unconfirmedPanelRejections).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const lacksContent =
  'soak record lacks signal/plan content; panel judgment cannot cover the remediation';
const staleOverride = 'stale owner sample — unconfirmed human override absent from draw';
interface RoundSixMatrixRow {
  name: string;
  mode: 'overrides' | 'late' | 'redraw' | 'skip' | 'legacy' | 'probe' | 'complete-probe' | 'human';
  ready: boolean;
  content?: Partial<RemediationSoakRecord>;
}
const roundSixMatrix: readonly RoundSixMatrixRow[] = [
  {
    name: 'n=1 plus two overrides among five candidates reaches READY',
    mode: 'overrides',
    ready: true,
  },
  {
    name: 'override created after draw makes sample stale with named cause',
    mode: 'late',
    ready: false,
  },
  { name: 'redraw includes later override and reaches READY', mode: 'redraw', ready: true },
  { name: 'legacy record without planSteps is skipped by panel-judge', mode: 'skip', ready: false },
  { name: 'pre-existing panel on legacy record is unverifiable', mode: 'legacy', ready: false },
  {
    name: '100 accepted panels plus 10 signed metadata-only sample judgments is NOT READY',
    mode: 'probe',
    ready: false,
  },
  {
    name: 'empty plan cannot be panel evidence',
    mode: 'legacy',
    ready: false,
    content: { planSteps: [] },
  },
  {
    name: 'missing signal title cannot be panel evidence',
    mode: 'legacy',
    ready: false,
    content: { signalTitle: undefined },
  },
  {
    name: 'missing signal description cannot be panel evidence',
    mode: 'legacy',
    ready: false,
    content: { signalDescription: undefined },
  },
  {
    name: 'missing signal evidence cannot be panel evidence',
    mode: 'legacy',
    ready: false,
    content: { signalEvidence: undefined },
  },
  {
    name: 'blank signal description cannot be panel evidence',
    mode: 'legacy',
    ready: false,
    content: { signalDescription: '  ' },
  },
  {
    name: '100 complete panels plus 10 signed sample judgments reaches READY',
    mode: 'complete-probe',
    ready: true,
  },
  { name: 'human marks remain allowed on metadata-only records', mode: 'human', ready: true },
];

interface ModelReport {
  summary: ReturnType<typeof readRemediationReviewSummary>;
  verdict: ReturnType<typeof evaluateEnforceReadiness>;
}
function reportModel(
  records: ReviewRecord[],
  samples: ReviewSample[],
  lines: string[],
  defaults = false
): ModelReport {
  const summary = readRemediationReviewSummary(
    { getRecords: () => records, record: () => false },
    { getRecords: () => samples, record: () => false },
    lines
  );
  const evidence = buildEnforceReadinessEvidence(
    summarizeRemediationSoak(
      lines.map((raw) => RemediationSoakRecordSchema.parse(JSON.parse(raw)))
    ),
    summary
  );
  const verdict = evaluateEnforceReadiness(
    evidence,
    defaults
      ? DEFAULT_ENFORCE_READINESS_CONFIG
      : {
          ...DEFAULT_ENFORCE_READINESS_CONFIG,
          minShadowSelections: 1,
          minJudgedRate: 1,
          minOwnerSample: 1,
        }
  );
  return { summary, verdict };
}

function confirmDraw(sample: ReviewSample, records: ReviewRecord[]): void {
  for (const soakRef of sample.refs) {
    records.push({
      judgeKind: 'owner-sample',
      sampleId: sample.id,
      soakRef,
      reviewedAt: time(6),
      reviewed: true,
      sound: true,
      evaluator: sample.owner,
      owner: sample.owner,
      ownerSignedOff: true,
    });
  }
}

function overrideRow(panel: ReviewRecord, hour: number): ReviewRecord {
  return { ...panel, judgeKind: 'human', sound: true, reviewedAt: time(hour), evaluator: 'Human' };
}

function overrideModel(
  dir: string,
  mode: 'overrides' | 'late' | 'redraw'
): ReturnType<typeof evaluateEnforceReadiness> {
  const artifacts = Array.from({ length: 5 }, (_, index) => fixture(dir, index < 2, {}, index));
  const records = artifacts.map(({ panel }) => panel);
  const overrides = artifacts.slice(0, 2).map(({ panel }) => overrideRow(panel, 3));
  records.push(...(mode === 'overrides' ? overrides : overrides.slice(0, 1)));
  let sample = { ...drawRemediationReviewSample(records, 1, 'Owner', 'seed'), sampledAt: time(4) };
  const samples = [sample];
  if (mode !== 'overrides') {
    const later = artifacts[1]!.panel;
    expect(sample.refs).not.toContain(later.soakRef);
    records.push(overrideRow(later, 5));
  }
  if (mode === 'redraw') {
    sample = {
      ...drawRemediationReviewSample(records, 1, 'Owner', 'redraw'),
      sampledAt: '2026-10-01T05:30:00.000Z',
    };
    samples.push(sample);
  }
  confirmDraw(sample, records);
  const report = reportModel(
    records,
    samples,
    artifacts.map(({ raw }) => raw)
  );
  if (mode === 'late') {
    expect(report.summary.sampleFresh).toBe(false);
    expect(report.verdict.criteria.find((row) => row.name === 'owner-agreement')?.detail).toContain(
      staleOverride
    );
    expect(report.verdict.criteria.find((row) => row.name === 'owner-agreement')?.detail).toContain(
      artifacts[1]!.panel.soakRef
    );
  } else {
    expect(sample.refs).toHaveLength(3); // One random current panel + two mandatory overrides.
    for (const row of overrides) expect(sample.refs).toContain(row.soakRef);
    expect(report.summary.unconfirmedPanelRejections).toBe(0);
    expect(report.summary.sample).toEqual({ n: 3, disagreements: 0 });
    const confirmedRedraw = drawRemediationReviewSample(records, 1, 'Owner', 'confirmed', samples);
    expect(confirmedRedraw.mandatoryOverrideRefs).toEqual([]);
    expect(confirmedRedraw.randomRefs).toHaveLength(1);
    expect(confirmedRedraw.refs).toHaveLength(1);
  }
  return report.verdict;
}

async function skipLegacyModel(dir: string, raw: string): Promise<void> {
  vi.stubEnv('NEXUS_DATA_DIR', dir);
  let output = '';
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });
  try {
    mkdirSync(dirname(getRemediationSoakFile()), { recursive: true });
    writeFileSync(getRemediationSoakFile(), raw + '\n');
    executeVoting.mockClear();
    await runPanelJudge(
      parseCliArgs(['remediation-review', 'panel-judge', '--batch', '1', '--format', 'json'])
    );
    expect(JSON.parse(output)).toMatchObject({
      judged: 0,
      attempted: 0,
      ineligibleSoakRecords: 1,
      ineligibleReason: lacksContent,
    });
    expect(executeVoting).not.toHaveBeenCalled();
  } finally {
    stdout.mockRestore();
    vi.unstubAllEnvs();
  }
}

function matrixContent(row: RoundSixMatrixRow): Partial<RemediationSoakRecord> {
  if (row.content !== undefined) return row.content;
  switch (row.mode) {
    case 'complete-probe':
      return {};
    case 'probe':
    case 'human':
      return {
        signalTitle: undefined,
        signalDescription: undefined,
        signalEvidence: undefined,
        planSteps: undefined,
      };
    default:
      return { planSteps: undefined };
  }
}

function expectLegacyReport(
  row: RoundSixMatrixRow,
  summary: ModelReport['summary'],
  records: ReviewRecord[]
): void {
  const { mode } = row;
  if (mode !== 'human' && mode !== 'complete-probe') {
    expect(summary.panel.n).toBe(0);
    expect(summary.unverifiablePanelRows).toBe(mode === 'probe' ? 100 : 1);
    expect(summary.unverifiablePanelReasons?.join('; ')).toContain(lacksContent);
  }
  if (mode === 'probe' || mode === 'complete-probe') {
    expect(
      records.filter(
        (record) => record.judgeKind === 'owner-sample' && record.ownerSignedOff === true
      )
    ).toHaveLength(10);
    expect(summary.rawOwnerSampleRows).toBe(10);
    expect(summary.sample.n).toBe(mode === 'probe' ? 0 : 10);
  }
}

async function legacyModel(dir: string, row: RoundSixMatrixRow): Promise<ModelReport> {
  const { mode } = row;
  const usesDefaults = mode === 'probe' || mode === 'complete-probe';
  const artifacts = Array.from({ length: usesDefaults ? 100 : 1 }, (_, index) =>
    fixture(dir, false, matrixContent(row), index)
  );
  const records = artifacts.map(({ panel }) => panel);
  if (mode === 'skip') await skipLegacyModel(dir, artifacts[0]!.raw);
  if (mode === 'human')
    records[0] = { ...overrideRow(records[0]!, 3), owner: 'Owner', ownerSignedOff: true };
  const sample = {
    ...drawRemediationReviewSample(records, 10, 'Owner', 'seed'),
    sampledAt: time(4),
  };
  const samples = sample.refs.length === 0 ? [] : [sample];
  confirmDraw(sample, records);
  const report = reportModel(
    records,
    samples,
    artifacts.map(({ raw }) => raw),
    usesDefaults
  );
  expectLegacyReport(row, report.summary, records);
  if (mode !== 'human' && mode !== 'complete-probe')
    expect(
      report.verdict.criteria.find((criterion) => criterion.name === 'owner-agreement')?.detail
    ).toContain(lacksContent);
  return report;
}

describe('round 6 owner-model matrix', () => {
  it.each(roundSixMatrix)('$name', async (row) => {
    const { mode, ready } = row;
    const dir = mkdtempSync(join(tmpdir(), 'owner-round-six-'));
    try {
      if (mode === 'overrides' || mode === 'late' || mode === 'redraw') {
        expect(overrideModel(dir, mode).ready).toBe(ready);
      } else {
        expect((await legacyModel(dir, row)).verdict.ready).toBe(ready);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
