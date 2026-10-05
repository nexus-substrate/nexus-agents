/** Damaged durable review evidence must never certify the retained healthy subset. */
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildVoteRecord } from '../../audit/vote-record-store.js';
import { buildRemediationPanelProposal } from './remediation-review-proposal.js';
import {
  createRemediationReviewStore,
  hashSoakRecordLine,
  readRemediationReviewSummary,
  soakRefOf,
  type ReviewRecord,
} from './remediation-review.js';
import {
  createRemediationReviewSampleStore,
  drawRemediationReviewSample,
  type ReviewSample,
} from './remediation-review-sample.js';
import { evaluateEnforceReadiness } from './improvement-enforce-readiness.js';
import {
  RemediationSoakRecordSchema,
  summarizeRemediationSoak,
  type RemediationSoakRecord,
} from './improvement-remediation-shadow.js';
import { buildEnforceReadinessEvidence } from './remediation-readiness-collector.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-corruption-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function artifacts(): RemediationSoakRecord[] {
  return Array.from({ length: 100 }, (_, index) =>
    RemediationSoakRecordSchema.parse({
      signalKey: `testing:coverage:module-${String(index)}`,
      timestamp: '2026-10-01T00:00:00.000Z',
      category: 'testing',
      priority: 'p2',
      severity: 'warning',
      signalTitle: 'Missing regression coverage',
      signalDescription: 'The owner review flow lacks a regression test.',
      signalEvidence: { samples: 5, observedValue: 0, threshold: 1 },
      planSteps: [{ kind: 'add-test', description: 'Cover owner review readiness' }],
      planStepCount: 1,
      reason: 'higher_order: approved (100%)',
      voteOutcome: { approved: true, approvalPercentage: 100 },
    })
  );
}

function human(soakRef: string): ReviewRecord {
  return {
    soakRef,
    reviewedAt: '2026-10-01T01:00:00.000Z',
    reviewed: true,
    sound: true,
    judgeKind: 'human',
    evaluator: 'Alice Reviewer',
    owner: 'Alice Owner',
    ownerSignedOff: true,
  };
}

function panel(soakRef: string, raw: string): ReviewRecord {
  return {
    soakRef,
    reviewedAt: '2026-10-01T01:00:00.000Z',
    reviewed: true,
    sound: false,
    judgeKind: 'panel',
    evaluator: 'panel:vote-rejection',
    voteRecordId: 'vote-rejection',
    voteLedgerPath: join(dir, 'votes.jsonl'),
    soakRecordHash: hashSoakRecordLine(raw),
  };
}

function votingResult(proposal: string): Parameters<typeof buildVoteRecord>[0]['result'] {
  return {
    proposalId: 'proposal-review',
    proposal: { title: 'Remediation review', description: proposal, algorithm: 'higher_order' },
    outcome: 'approved' as const,
    votes: new Map(),
    voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
    approvalPercentage: 100,
    quorumReached: true,
    startedAt: '2026-10-01T01:00:00.000Z',
    closedAt: '2026-10-01T01:00:00.010Z',
    durationMs: 10,
  };
}

function approvedPanel(soakRef: string, raw: string, index: number): ReviewRecord {
  const proposal = buildRemediationPanelProposal(raw);
  const id = `vote-${String(index)}`;
  const vote = buildVoteRecord({
    id,
    proposal,
    strategy: 'higher_order',
    declaredOptions: undefined,
    resolvedDecision: 'approved',
    errorPolicy: 'absolute_quorum',
    votes: [
      {
        role: 'architect',
        source: 'llm',
        processingTimeMs: 10,
        vote: {
          decision: 'approve',
          confidence: 1,
          reasoning: 'The repair addresses the coverage gap',
        },
      },
    ],
    result: votingResult(proposal),
  });
  appendFileSync(join(dir, 'votes.jsonl'), JSON.stringify(vote) + '\n');
  return { ...panel(soakRef, raw), sound: true, voteRecordId: id, evaluator: `panel:${id}` };
}

interface CorruptHistoryFixture {
  soak: RemediationSoakRecord[];
  lines: string[];
  original: ReviewSample;
  active: ReviewSample;
  reviewPath: string;
  samplePath: string;
}

function corruptHistoricalDraw(): CorruptHistoryFixture {
  const soak = artifacts();
  const lines = soak.map((record) => JSON.stringify(record));
  const panels = soak
    .slice(80)
    .map((record, index) => approvedPanel(soakRefOf(record), lines[80 + index]!, index));
  const active = {
    ...drawRemediationReviewSample(panels, 10, 'Alice Owner', 'owner-active'),
    sampledAt: '2026-10-01T02:00:00.000Z',
  };
  const excluded = panels.find((row) => !active.refs.includes(row.soakRef))!;
  const original = drawRemediationReviewSample([excluded], 1, 'Alice Owner', 'owner-original');
  const mark = (sampleId: string, soakRef: string, sound: boolean): ReviewRecord => ({
    judgeKind: 'owner-sample',
    sampleId,
    soakRef,
    sound,
    reviewed: true,
    reviewedAt: '2026-10-01T03:00:00.000Z',
    evaluator: 'Alice Owner',
    owner: 'Alice Owner',
    ownerSignedOff: true,
  });
  const rows = [
    ...soak.slice(0, 80).map((record) => human(soakRefOf(record))),
    ...panels,
    mark(original.id, excluded.soakRef, false),
    ...active.refs.map((ref) => mark(active.id, ref, true)),
  ];
  const reviewPath = join(dir, 'reviews.jsonl');
  writeFileSync(reviewPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const samplePath = join(dir, 'samples.jsonl');
  writeFileSync(
    samplePath,
    JSON.stringify({ ...original, seed: '' }) + '\n' + JSON.stringify(active) + '\n'
  );
  return { soak, lines, original, active, reviewPath, samplePath };
}

const noSamples = { record: () => false, getRecords: () => [] };

describe('damaged durable review evidence', () => {
  it('keeps 80 human approvals plus 20 schema-invalid panel rejections NOT READY', () => {
    const soak = artifacts();
    const lines = soak.map((record) => JSON.stringify(record));
    const rows = soak.map((record, index) =>
      index < 80
        ? human(soakRefOf(record))
        : { ...panel(soakRefOf(record), lines[index]!), voteLedgerPath: 'relative/votes.jsonl' }
    );
    const path = join(dir, 'reviews.jsonl');
    writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
    const reviews = createRemediationReviewStore(path);
    const summary = readRemediationReviewSummary(reviews, noSamples, lines);
    expect(reviews.getRecords()).toHaveLength(80);
    expect(summary).toHaveProperty('reviewStoreComplete', false);
    const verdict = evaluateEnforceReadiness(
      buildEnforceReadinessEvidence(summarizeRemediationSoak(soak), summary)
    );
    expect(verdict.ready).toBe(false);
    expect(
      verdict.criteria.find((criterion) => criterion.name === 'owner-agreement')
    ).toMatchObject({
      met: false,
      detail: expect.stringMatching(/corrupt|unreadable/i),
    });
  });

  it('refuses to append over incomplete review hydration and preserves damaged evidence', () => {
    const path = join(dir, 'reviews.jsonl');
    const raw = '{incomplete rejection row\n';
    writeFileSync(path, raw);
    const reviews = createRemediationReviewStore(path);
    expect(reviews.record(human('testing:coverage::2026-10-01T00:00:00.000Z'))).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe(raw);
    expect(reviews.getRecords()).toHaveLength(0);
  });

  it('retains NOT READY when damaged sample history erases an earlier owner disagreement', () => {
    const fixture = corruptHistoricalDraw();
    const reviews = createRemediationReviewStore(fixture.reviewPath);
    const samples = createRemediationReviewSampleStore(fixture.samplePath);
    const summary = readRemediationReviewSummary(reviews, samples, fixture.lines);
    expect(summary.sample).toEqual({ n: 10, disagreements: 0 });
    expect(summary).toHaveProperty('sampleStoreComplete', false);
    const evidence = buildEnforceReadinessEvidence(summarizeRemediationSoak(fixture.soak), summary);
    const verdict = evaluateEnforceReadiness(evidence);
    expect(verdict.ready).toBe(false);
    expect(
      verdict.criteria.find((criterion) => criterion.name === 'owner-agreement')
    ).toMatchObject({
      met: false,
      detail: expect.stringMatching(/corrupt|unreadable/i),
    });
    // All other evidence is sufficient: losing this corruption flag would promote enforcement.
    expect(evaluateEnforceReadiness({ ...evidence, sampleStoreComplete: true }).ready).toBe(true);
  });

  it('refuses to append over incomplete sample hydration and preserves historical evidence', () => {
    const raw = JSON.stringify(artifacts()[0]);
    const first = panel('testing:coverage:module-0::2026-10-01T00:00:00.000Z', raw);
    const sample = drawRemediationReviewSample([first], 1, 'Alice Owner', 'owner-original');
    const path = join(dir, 'samples.jsonl');
    const damaged = JSON.stringify({ ...sample, seed: '' }) + '\n';
    writeFileSync(path, damaged);
    const samples = createRemediationReviewSampleStore(path);
    expect(samples).toHaveProperty('hydrationComplete', false);
    expect(samples.record(sample)).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe(damaged);
    expect(samples.getRecords()).toHaveLength(0);
  });

  it('names a missing sample file as completely read empty history', () => {
    const samples = createRemediationReviewSampleStore(join(dir, 'missing.jsonl'));
    expect(samples).toHaveProperty('hydrationComplete', true);
    expect(samples.getRecords()).toEqual([]);
  });
});
