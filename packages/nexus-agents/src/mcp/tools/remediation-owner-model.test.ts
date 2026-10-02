/** End-to-end matrix for the owner-sample model, including persisted panel verification. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVoteRecord } from '../../audit/vote-record-store.js';
import { buildRemediationPanelProposal } from './remediation-review-proposal.js';
import {
  RemediationSoakRecordSchema,
  summarizeRemediationSoak,
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

function fixture(dir: string, rejected: boolean): { panel: ReviewRecord; raw: string } {
  const raw = JSON.stringify(
    RemediationSoakRecordSchema.parse({
      signalKey: 'testing:coverage',
      timestamp: time(0),
      category: 'testing',
      priority: 'p2',
      severity: 'warning',
      planStepCount: 1,
      reason: 'review matrix',
      voteOutcome: { approved: true, approvalPercentage: 100 },
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
  const path = join(dir, 'votes.jsonl');
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
