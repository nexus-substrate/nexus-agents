/** Persisted provenance must verify against realistic improvement soak artifacts. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVoteRecord, MAX_PROPOSAL_RECORD_CHARS } from '../../audit/vote-record-store.js';
import { hashProposal, computeVoteRecordHash, type VoteRecord } from '../../audit/vote-record.js';
import * as review from './remediation-review.js';
import { buildRemediationPanelProposal } from './remediation-review-proposal.js';
import {
  RemediationSoakRecordSchema,
  summarizeRemediationSoak,
  getRemediationSoakFile,
  _resetRemediationSoakSinkForTests,
  createRemediationSoakSink,
  getRemediationSoakSink,
  readRemediationSoakSummary,
} from './improvement-remediation-shadow.js';
import {
  DEFAULT_ENFORCE_READINESS_CONFIG,
  evaluateEnforceReadiness,
} from './improvement-enforce-readiness.js';
import { buildAutoRemediationDeps } from './auto-remediation-deps.js';
import { handleRemediationReviewCommand } from '../../cli/remediation-review-command.js';
import { parseCliArgs } from '../../cli.js';
import { buildEnforceReadinessEvidence } from './remediation-readiness-collector.js';

const raw = JSON.stringify({
  signalKey: 'testing:coverage:cli-adapters',
  timestamp: '2026-09-29T12:00:00.000Z',
  category: 'testing',
  priority: 'p2',
  severity: 'warning',
  signalTitle: 'Missing regression coverage',
  signalDescription: 'The owner review flow lacks a regression test.',
  signalEvidence: { samples: 5, observedValue: 0, threshold: 1 },
  planSteps: [{ kind: 'add-test', description: 'Cover owner review readiness' }],
  planStepCount: 3,
  reason: 'higher_order: approved (100%)',
  voteOutcome: { approved: true, approvalPercentage: 100 },
});
const hash = review.hashSoakRecordLine(raw);
const proposal = buildRemediationPanelProposal(raw);
function vote(over: Partial<VoteRecord> = {}): VoteRecord {
  const rejected = over.decision === 'rejected';
  const built = buildVoteRecord({
    id: 'vote-1',
    proposal,
    strategy: 'higher_order',
    declaredOptions: undefined,
    resolvedDecision: rejected ? 'rejected' : 'approved',
    errorPolicy: 'absolute_quorum',
    votes: [
      {
        role: 'architect',
        source: 'llm',
        processingTimeMs: 10,
        vote: {
          decision: rejected ? 'reject' : 'approve',
          confidence: 1,
          reasoning: rejected
            ? 'The selected repair does not address the signal'
            : 'The selected repair addresses the signal',
        },
      },
    ],
    result: {
      proposalId: 'proposal-1',
      proposal: { title: 'Selection', description: proposal, algorithm: 'higher_order' },
      outcome: rejected ? 'rejected' : 'approved',
      votes: new Map(),
      voteCounts: { approve: rejected ? 0 : 1, reject: rejected ? 1 : 0, abstain: 0, total: 1 },
      approvalPercentage: rejected ? 0 : 100,
      quorumReached: true,
      startedAt: '2026-09-30T00:00:00.000Z',
      closedAt: '2026-09-30T00:00:00.010Z',
      durationMs: 10,
    },
  });
  const record = { ...built, ...over };
  return { ...record, hash: computeVoteRecordHash(record) };
}
function panel(over: Partial<review.ReviewRecord> = {}): review.ReviewRecord {
  return {
    soakRef: 'testing:coverage:cli-adapters::2026-09-29T12:00:00.000Z',
    reviewedAt: '2026-09-30T00:00:00.000Z',
    reviewed: true,
    sound: true,
    judgeKind: 'panel',
    evaluator: 'panel:vote-1',
    voteRecordId: 'vote-1',
    voteLedgerPath: ledger,
    soakRecordHash: hash,
    ...over,
  };
}
function store(records: readonly review.ReviewRecord[]): review.RemediationReviewStore {
  return { record: () => false, getRecords: () => records };
}
const samples: review.RemediationReviewSampleStore = { record: () => false, getRecords: () => [] };
let dir: string;
let ledger: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-ledger-'));
  ledger = join(dir, 'votes.jsonl');
  vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', ledger);
  vi.stubEnv('NEXUS_DATA_DIR', dir);
  review._resetRemediationReviewStoreForTests();
  _resetRemediationSoakSinkForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
  review._resetRemediationReviewStoreForTests();
  _resetRemediationSoakSinkForTests();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
function persist(record: VoteRecord): void {
  writeFileSync(ledger, JSON.stringify(record) + '\n');
}

function seedFreshnessEvidence(): { sample: review.ReviewSample; mark: review.ReviewRecord } {
  persist(vote());
  createRemediationSoakSink().record(RemediationSoakRecordSchema.parse(JSON.parse(raw)));
  // Panel provenance binds the exact bytes, including JSON field order.
  writeFileSync(getRemediationSoakFile(), raw + '\n');
  expect(review.createRemediationReviewStore().record(panel(), raw)).toBe(true);
  const sample = {
    ...review.drawRemediationReviewSample([panel()], 1, 'Owner', 'seed'),
    sampledAt: '2026-09-30T01:00:00.000Z',
  };
  expect(review.createRemediationReviewSampleStore().record(sample)).toBe(true);
  const mark: review.ReviewRecord = {
    judgeKind: 'owner-sample',
    sampleId: sample.id,
    soakRef: panel().soakRef,
    reviewedAt: '2026-09-30T02:00:00.000Z',
    reviewed: true,
    sound: true,
    evaluator: sample.owner,
    owner: sample.owner,
    ownerSignedOff: true,
  };
  expect(review.createRemediationReviewStore().record(mark)).toBe(true);
  return { sample, mark };
}

describe('call-time readiness evidence', () => {
  for (const source of ['summary', 'provider'] as const) {
    function reader(): () => Promise<ReturnType<typeof evaluateEnforceReadiness>> {
      const deps = buildAutoRemediationDeps();
      return async () => {
        const evidence =
          source === 'provider'
            ? await deps.readinessEvidence()
            : buildEnforceReadinessEvidence(
                readRemediationSoakSummary(),
                review.readRemediationReviewSummary()
              );
        return evaluateEnforceReadiness(evidence, {
          ...DEFAULT_ENFORCE_READINESS_CONFIG,
          minShadowSelections: 1,
          minOwnerSample: 1,
        });
      };
    }

    it(`${source} sees owner unsound sample marks from a separate store`, async () => {
      const { mark } = seedFreshnessEvidence();
      const read = reader();
      expect((await read()).ready).toBe(true);
      expect(
        review.createRemediationReviewStore().record({
          ...mark,
          sound: false,
          ownerSignedOff: false,
          reviewedAt: '2026-09-30T03:00:00.000Z',
        })
      ).toBe(true);
      const verdict = await read();
      expect(verdict.ready).toBe(false);
      expect(verdict.criteria.find((c) => c.name === 'owner-agreement')?.detail).toContain(
        '1 unresolved owner disagreements'
      );
    });

    it(`${source} sees human unsound marks from a separate store`, async () => {
      seedFreshnessEvidence();
      const read = reader();
      expect((await read()).ready).toBe(true);
      expect(
        review.createRemediationReviewStore().record({
          soakRef: panel().soakRef,
          judgeKind: 'human',
          reviewed: true,
          sound: false,
          evaluator: 'Human',
          ownerSignedOff: false,
          reviewedAt: '2026-09-30T03:00:00.000Z',
        })
      ).toBe(true);
      const verdict = await read();
      expect(verdict.ready).toBe(false);
      expect(verdict.criteria.find((c) => c.name === 'soundness')).toMatchObject({
        met: false,
        detail: expect.stringContaining('0% of reviewed judged sound'),
      });
    });

    it(`${source} sees sign-off from a separate store`, async () => {
      const { mark } = seedFreshnessEvidence();
      expect(
        review.createRemediationReviewStore().record({
          ...mark,
          ownerSignedOff: false,
          reviewedAt: '2026-09-30T03:00:00.000Z',
        })
      ).toBe(true);
      const read = reader();
      expect((await read()).ready).toBe(false);
      expect(
        review.createRemediationReviewStore().record({
          ...mark,
          ownerSignedOff: true,
          reviewedAt: '2026-09-30T03:00:00.000Z',
        })
      ).toBe(true);
      expect((await read()).ready).toBe(true);
    });
  }

  it('sees a separate-process sample redraw on the next readiness read', async () => {
    const { sample } = seedFreshnessEvidence();
    const deps = buildAutoRemediationDeps();
    expect((await deps.readinessEvidence()).sampleFresh).toBe(true);
    expect(
      review.createRemediationReviewSampleStore().record({
        ...sample,
        id: 'later-draw',
        sampledAt: '2026-09-30T03:00:00.000Z',
      })
    ).toBe(true);
    const evidence = await deps.readinessEvidence();
    expect(evidence.sample).toEqual({ n: 0, disagreements: 0 });
    expect(evidence.owner).toBeUndefined();
  });

  it('sees separate-store soak appends on the same provider', async () => {
    seedFreshnessEvidence();
    const deps = buildAutoRemediationDeps();
    expect((await deps.readinessEvidence()).shadowSelections).toBe(1);
    createRemediationSoakSink().record({
      ...RemediationSoakRecordSchema.parse(JSON.parse(raw)),
      signalKey: 'testing:coverage:later',
    });
    expect((await deps.readinessEvidence()).shadowSelections).toBe(2);
  });

  it('fresh reads see appends through the cached review and soak instances', () => {
    seedFreshnessEvidence();
    const reviews = review.getRemediationReviewStore();
    const soak = getRemediationSoakSink();
    expect(review.readRemediationReviewSummary().human.n).toBe(0);
    expect(readRemediationSoakSummary().total).toBe(1);
    expect(
      reviews.record({
        soakRef: panel().soakRef,
        reviewedAt: '2026-09-30T03:00:00.000Z',
        reviewed: true,
        sound: false,
        evaluator: 'Human',
      })
    ).toBe(true);
    soak.record({
      ...RemediationSoakRecordSchema.parse(JSON.parse(raw)),
      signalKey: 'testing:coverage:cached',
    });
    expect(review.readRemediationReviewSummary().human).toEqual({ n: 1, disagreements: 1 });
    expect(readRemediationSoakSummary().total).toBe(2);
  });

  it('record reads see separate-store judgments without resetting the reader', () => {
    seedFreshnessEvidence();
    expect(
      review.readRemediationReviewRecords().filter((r) => r.judgeKind === 'human')
    ).toHaveLength(0);
    expect(
      review.createRemediationReviewStore().record({
        soakRef: panel().soakRef,
        reviewedAt: '2026-09-30T03:00:00.000Z',
        reviewed: true,
        sound: false,
        evaluator: 'Human',
      })
    ).toBe(true);
    expect(review.readRemediationReviewRecords().find((r) => r.judgeKind === 'human')?.sound).toBe(
      false
    );
  });

  it('CLI sign-off reads separately appended owner dissent before copying judgments', async () => {
    const { mark } = seedFreshnessEvidence();
    review.getRemediationReviewStore(); // Long-lived append instance predates the CLI mark.
    expect(
      review.createRemediationReviewStore().record({
        ...mark,
        sound: false,
        ownerSignedOff: false,
        reviewedAt: '2026-09-30T03:00:00.000Z',
      })
    ).toBe(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await handleRemediationReviewCommand(
      parseCliArgs(['remediation-review', 'sign-off', '--owner', 'Owner', '--format', 'json'])
    );
    const result = JSON.parse(stdout.mock.calls.map(([chunk]) => String(chunk)).join(''));
    expect(result.summary.sample.disagreements).toBe(1);
    expect(review.createRemediationReviewStore().getRecords().at(-1)).toMatchObject({
      sound: false,
      ownerSignedOff: true,
    });
  });
});

describe('CLI call-time evidence', () => {
  it('readiness sees human dissent and subsequent sign-off in the same process', async () => {
    const soak = createRemediationSoakSink();
    const reviews = review.createRemediationReviewStore();
    for (let i = 0; i < DEFAULT_ENFORCE_READINESS_CONFIG.minShadowSelections; i++) {
      const record = {
        ...RemediationSoakRecordSchema.parse(JSON.parse(raw)),
        signalKey: `testing:coverage:${String(i)}`,
      };
      soak.record(record);
      expect(
        reviews.record({
          soakRef: review.soakRefOf(record),
          reviewedAt: '2026-09-30T02:00:00.000Z',
          reviewed: true,
          sound: true,
          evaluator: 'Human',
          owner: 'Owner',
          ownerSignedOff: true,
        })
      ).toBe(true);
    }
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    type CliReadiness = {
      ready: boolean;
      evidence: { human: { disagreements: number }; owner: string };
      criteria: { name: string; met: boolean }[];
    };
    const read = async (): Promise<CliReadiness> => {
      stdout.mockClear();
      await handleRemediationReviewCommand(
        parseCliArgs(['remediation-review', 'readiness', '--format', 'json'])
      );
      return JSON.parse(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')) as CliReadiness;
    };
    expect((await read()).ready).toBe(true);
    const dissent = {
      ...reviews.getRecords()[0]!,
      sound: false,
      ownerSignedOff: false,
      reviewedAt: '2026-09-30T03:00:00.000Z',
    };
    const dissentCount =
      Math.ceil(
        reviews.getRecords().length * (1 - DEFAULT_ENFORCE_READINESS_CONFIG.minSoundnessRate)
      ) + 1;
    // Exceed the configured soundness tolerance by at least one dissenting mark.
    const separate = review.createRemediationReviewStore();
    for (const record of reviews.getRecords().slice(0, dissentCount))
      expect(separate.record({ ...dissent, soakRef: record.soakRef })).toBe(true);
    const rejected = await read();
    expect(rejected.ready).toBe(false);
    expect(rejected.evidence.human.disagreements).toBe(dissentCount);
    expect(rejected.criteria.find((c) => c.name === 'soundness')?.met).toBe(false);
    expect(
      review
        .createRemediationReviewStore()
        .record({ ...dissent, owner: 'New owner', ownerSignedOff: true })
    ).toBe(true);
    expect((await read()).evidence.owner).toBe('New owner');
  });

  it('mark validates a separately appended soak selection with a cached sink present', async () => {
    getRemediationSoakSink();
    const record = RemediationSoakRecordSchema.parse(JSON.parse(raw));
    createRemediationSoakSink().record(record);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await handleRemediationReviewCommand(
      parseCliArgs([
        'remediation-review',
        'mark',
        review.soakRefOf(record),
        '--unsound',
        '--evaluator',
        'Human',
      ])
    );
    expect(review.createRemediationReviewStore().getRecords().at(-1)?.sound).toBe(false);
  });
});

describe('panel ledger verification', () => {
  it('uses a schema-valid realistic soak artifact', () => {
    expect(RemediationSoakRecordSchema.parse(JSON.parse(raw)).reason).toBe(
      'higher_order: approved (100%)'
    );
  });
  it('counts a persisted approved vote bound to the exact soak line', () => {
    persist(vote());
    expect(review.readRemediationReviewSummary(store([panel()]), samples, [raw]).panel.n).toBe(1);
  });
  it.each([
    'missing',
    'decision',
    'proposalHash',
    'proposalText',
    'selfHash',
    'no_quorum',
    'wrongArtifact',
  ] as const)('reports and excludes an unverifiable panel row: %s', (kind) => {
    const record = vote();
    if (kind === 'decision') persist(vote({ decision: 'rejected' }));
    else if (kind === 'proposalHash') persist(vote({ proposalHash: 'a'.repeat(64) }));
    else if (kind === 'proposalText') persist(vote({ proposal: 'Review another selection' }));
    else if (kind === 'selfHash') persist({ ...record, hash: 'b'.repeat(64) });
    else if (kind === 'no_quorum') persist(vote({ decision: 'no_quorum' }));
    else if (kind === 'wrongArtifact')
      persist(
        vote({ proposalHash: 'c'.repeat(64), proposal: proposal.replace(hash, 'c'.repeat(64)) })
      );
    const summary = review.readRemediationReviewSummary(store([panel()]), samples, [raw]);
    expect(summary.panel.n).toBe(0);
    expect(summary.unverifiablePanelRows).toBe(1);
    expect(review.readRemediationReviewRecords(store([panel()]), [raw])).toEqual([]);
  });
  it('rejects a panel hash when the exact stored line changes whitespace', () => {
    persist(vote());
    const summary = review.readRemediationReviewSummary(store([panel()]), samples, [raw + ' ']);
    expect(summary.panel.n).toBe(0);
    expect(summary.unverifiablePanelRows).toBe(1);
  });
  it('accepts a persisted rejection only as an unsound verdict', () => {
    persist(vote({ decision: 'rejected' }));
    const summary = review.readRemediationReviewSummary(store([panel({ sound: false })]), samples, [
      raw,
    ]);
    expect(summary.panel).toEqual({ n: 1, disagreements: 1 });
  });
  it('keeps the human current when a later panel cannot verify', () => {
    const human = { ...panel(), judgeKind: 'human' as const, evaluator: 'Alice' };
    // Human outranks panel regardless of append order or panel verifiability.
    expect(review.readRemediationReviewRecords(store([human, panel()]), [raw])).toEqual([human]);
  });
  it('reports evicted refs separately from unverifiable panels, including owner marks', () => {
    const human = { ...panel(), judgeKind: 'human' as const, evaluator: 'Alice' };
    const mark = { ...human, judgeKind: 'owner-sample' as const, sampleId: 'sample-old' };
    const summary = review.readRemediationReviewSummary(store([human, panel(), mark]), samples, []);
    expect(summary.evictedReviewRows).toBe(2); // Superseded panel is reported separately.
    expect(summary.supersededPanelRows).toBe(1);
    expect(summary.unverifiablePanelRows).toBe(0);
    expect(summary.judgedSelections).toBe(0);
  });
  it('retains owner judgment history past the soak retention cap', () => {
    const path = join(dir, 'reviews.jsonl');
    const mark = {
      ...panel(),
      judgeKind: 'owner-sample' as const,
      evaluator: 'Alice',
      sampleId: 'old-sample',
      sound: false,
    };
    const human = { ...panel(), judgeKind: 'human' as const, evaluator: 'Bob' };
    writeFileSync(
      path,
      [mark, ...Array.from({ length: 10_000 }, () => human)]
        .map((r) => JSON.stringify(r))
        .join('\n') + '\n'
    );
    const reloaded = review.createRemediationReviewStore(path);
    expect(reloaded.getRecords()).toHaveLength(10_001);
    expect(reloaded.getRecords()[0]).toMatchObject({ sampleId: 'old-sample', sound: false });
  });
  it.each(['2026-09-29T23:59:00.000Z', '2026-09-30T00:00:00.000Z', 'not-a-time'])(
    'rejects an owner sample not strictly after the current panel judgment: %s',
    (sampledAt) => {
      persist(vote());
      const sample = {
        ...review.drawRemediationReviewSample([panel()], 1, 'Alice', 'freshness'),
        sampledAt,
      };
      const mark = {
        ...panel(),
        judgeKind: 'owner-sample' as const,
        evaluator: 'Alice',
        sampleId: sample.id,
      };
      const sampleStore: review.RemediationReviewSampleStore = {
        record: () => false,
        getRecords: () => [sample],
      };
      const summary = review.readRemediationReviewSummary(store([panel(), mark]), sampleStore, [
        raw,
      ]);
      expect(summary.sampleFresh).toBe(false);
      const evidence = buildEnforceReadinessEvidence(
        summarizeRemediationSoak([RemediationSoakRecordSchema.parse(JSON.parse(raw))]),
        summary
      );
      const verdict = evaluateEnforceReadiness(evidence, {
        minShadowSelections: 1,
        minJudgedRate: 1,
        minSoundnessRate: 1,
        requireNamedEvaluator: true,
        requireNamedOwner: false,
        minOwnerSample: 1,
        maxSampleDisagreements: 0,
      });
      expect(verdict.criteria.find((c) => c.name === 'owner-agreement')?.met).toBe(false);
    }
  );
  it('measures a current draw after the latest panel judgment as fresh', () => {
    const sample = {
      ...review.drawRemediationReviewSample([panel()], 1, 'Alice', 'freshness'),
      sampledAt: '2026-09-30T00:00:01.000Z',
    };
    expect(review.summarizeRemediationReviews([panel()], sample).sampleFresh).toBe(true);
  });
  it('keeps disagreement history even when its soak line was evicted', () => {
    persist(vote());
    const oldPanel = panel({ soakRef: 'evicted-ref' });
    const oldSample = review.drawRemediationReviewSample([oldPanel], 1, 'Alice', 'old');
    const active = review.drawRemediationReviewSample([panel()], 1, 'Alice', 'active');
    const oldMark = {
      ...oldPanel,
      judgeKind: 'owner-sample' as const,
      evaluator: 'Alice',
      sampleId: oldSample.id,
      sound: false,
    };
    const newMark = {
      ...panel(),
      judgeKind: 'owner-sample' as const,
      evaluator: 'Alice',
      sampleId: active.id,
    };
    const sampleStore: review.RemediationReviewSampleStore = {
      record: () => false,
      getRecords: () => [oldSample, active],
    };
    const summary = review.readRemediationReviewSummary(
      store([oldPanel, oldMark, panel(), newMark]),
      sampleStore,
      [raw]
    );
    expect(summary.evictedReviewRows).toBe(2);
    expect(summary.sample).toEqual({ n: 1, disagreements: 1 });
  });
  it('preserves explicit human sign-off after all panel judgments are superseded', () => {
    const sample = review.drawRemediationReviewSample([panel()], 1, 'Alice', 'historical');
    const human = {
      ...panel(),
      judgeKind: 'human' as const,
      evaluator: 'Alice',
      owner: 'Carol',
      ownerSignedOff: true,
    };
    const summary = review.summarizeRemediationReviews([panel(), human], sample);
    expect(summary.panel.n).toBe(0);
    expect(summary.owner).toBe('Carol');
  });
  it('a panel id never supplies the named evaluator', () => {
    expect(review.summarizeRemediationReviews([panel()]).evaluator).toBeUndefined();
  });
  it('uses the named sampled human evaluator even when the only primary is a panel', () => {
    const mark = {
      ...panel(),
      judgeKind: 'owner-sample' as const,
      evaluator: 'Alice',
      sampleId: 'sample-1',
    };
    expect(review.summarizeRemediationReviews([panel(), mark]).evaluator).toBe('Alice');
  });
});

describe('raw review evidence cannot become absence', () => {
  it.each(['missing', 'malformed', 'evicted', 'duplicate'] as const)(
    'keeps the 80 sound human + 20 panel rejection probe NOT READY: %s',
    (failure) => {
      const lines = Array.from({ length: 100 }, (_, i) =>
        JSON.stringify({ ...JSON.parse(raw), signalKey: `testing:coverage:adapter-${String(i)}` })
      );
      const rows = lines.map((line, i): review.ReviewRecord => {
        const soakRef = review.soakRefOf(RemediationSoakRecordSchema.parse(JSON.parse(line)));
        return i < 80
          ? {
              soakRef,
              reviewedAt: '2026-09-30T00:00:00.000Z',
              reviewed: true,
              sound: true,
              judgeKind: 'human',
              evaluator: 'Alice',
              owner: 'Carol',
              ownerSignedOff: true,
            }
          : panel({
              soakRef,
              sound: false,
              voteRecordId: `vote-${String(i)}`,
              evaluator: `panel:vote-${String(i)}`,
              soakRecordHash: review.hashSoakRecordLine(line),
            });
      });
      const votes = lines.slice(80).map((line, i) => {
        const text = buildRemediationPanelProposal(line);
        return vote({
          id: `vote-${String(i + 80)}`,
          decision: 'rejected',
          proposalHash: hashProposal(text),
          proposal:
            text.length > MAX_PROPOSAL_RECORD_CHARS
              ? text.slice(0, MAX_PROPOSAL_RECORD_CHARS) + '...'
              : text,
        });
      });
      writeFileSync(ledger, votes.map((v) => JSON.stringify(v)).join('\n') + '\n');
      const evaluate = (
        artifacts: readonly string[]
      ): ReturnType<typeof evaluateEnforceReadiness> =>
        evaluateEnforceReadiness(
          buildEnforceReadinessEvidence(
            summarizeRemediationSoak(
              lines.map((line) => RemediationSoakRecordSchema.parse(JSON.parse(line)))
            ),
            review.readRemediationReviewSummary(store(rows), samples, artifacts)
          )
        );
      expect(evaluate(lines).blockers).toContain('soundness');
      let artifacts = lines;
      if (failure === 'missing') rmSync(ledger);
      if (failure === 'malformed') writeFileSync(ledger, '{broken json\n');
      if (failure === 'evicted') artifacts = lines.slice(0, 80);
      if (failure === 'duplicate') artifacts = [...lines, ...lines.slice(80)];
      const verdict = evaluate(artifacts);
      expect(verdict.ready).toBe(false);
      expect(verdict.blockers).toContain('owner-agreement');
      expect(verdict.blockers).toContain('judged-coverage');
      expect(verdict.criteria.find((c) => c.name === 'owner-agreement')?.detail).not.toContain(
        'n/a'
      );
    }
  );
  it('refuses a ledger with an invalid line even when the matching vote parses', () => {
    persist(vote());
    writeFileSync(ledger, JSON.stringify(vote()) + '\n{broken json\n');
    const summary = review.readRemediationReviewSummary(store([panel()]), samples, [raw]);
    expect(summary.panel.n).toBe(0);
    expect(summary.unverifiablePanelRows).toBe(1);
  });
  it('never resolves a panel row through the current cwd ledger when its pinned file is absent', () => {
    persist(vote());
    const row = { ...panel(), voteLedgerPath: join(dir, 'absent.jsonl') };
    expect(review.readRemediationReviewSummary(store([row]), samples, [raw]).panel.n).toBe(0);
  });
  it('treats duplicate soak refs as unverifiable even when the last line matches', () => {
    persist(vote());
    const summary = review.readRemediationReviewSummary(store([panel()]), samples, [
      raw + ' ',
      raw,
    ]);
    expect(summary.panel.n).toBe(0);
    expect(summary.unverifiablePanelRows).toBe(1);
  });
});

describe('complete provenance and applicability', () => {
  it('retains all raw panel and owner-sample rows when verification excludes them', () => {
    const mark = {
      ...panel(),
      judgeKind: 'owner-sample' as const,
      evaluator: 'Carol',
      sampleId: 'old-draw',
    };
    const summary = review.readRemediationReviewSummary(store([panel(), mark]), samples, []);
    expect(summary).toMatchObject({
      rawPanelRows: 1,
      rawOwnerSampleRows: 1,
      evictedPanelRows: 1,
      panel: { n: 0 },
    });
  });
  it('verifies a realistic artifact whose proposal is clipped to the shared record limit', () => {
    const line = JSON.stringify({
      ...JSON.parse(raw),
      signalTitle: 'Repeated routing failures in CLI fallback',
      signalDescription: 'Adapter fallback silently discards the failure diagnostics. '.repeat(20),
      signalEvidence: { samples: 100, observedValue: 0.3, threshold: 0.7 },
      planSteps: [
        {
          kind: 'add-test',
          description: 'Exercise adapter failure and fallback with preserved diagnostics',
          targetPath: 'src/cli-adapters/fallback.test.ts',
        },
      ],
    });
    const text = buildRemediationPanelProposal(line);
    expect(text.length).toBeGreaterThan(MAX_PROPOSAL_RECORD_CHARS);
    persist(
      vote({
        proposalHash: hashProposal(text),
        proposal: text.slice(0, MAX_PROPOSAL_RECORD_CHARS) + '...',
      })
    );
    const summary = review.readRemediationReviewSummary(
      store([panel({ soakRecordHash: review.hashSoakRecordLine(line) })]),
      samples,
      [line]
    );
    expect(summary.panel.n).toBe(1);
  });
  it.each(['absent', 'relative', 'unreadable'] as const)(
    'rejects %s pinned-ledger provenance',
    (kind) => {
      persist(vote());
      const row = panel();
      if (kind === 'absent') delete row.voteLedgerPath;
      if (kind === 'relative') row.voteLedgerPath = 'votes.jsonl';
      if (kind === 'unreadable') row.voteLedgerPath = dir;
      expect(review.readRemediationReviewSummary(store([row]), samples, [raw])).toMatchObject({
        panel: { n: 0 },
        unverifiablePanelRows: 1,
      });
    }
  );
});

describe('panel evidence recovery and diagnostics', () => {
  it('recovers after humans supersede all 20 unverifiable panels', () => {
    const lines = Array.from({ length: 20 }, (_, index) =>
      JSON.stringify({ ...JSON.parse(raw), signalKey: `recovery:${String(index)}` })
    );
    const panels = lines.map((line) =>
      panel({
        soakRef: review.soakRefOf(RemediationSoakRecordSchema.parse(JSON.parse(line))),
        soakRecordHash: review.hashSoakRecordLine(line),
      })
    );
    const humans = panels.map((row): review.ReviewRecord => ({
      judgeKind: 'human',
      soakRef: row.soakRef,
      reviewedAt: '2026-10-01T00:00:00.000Z',
      reviewed: true,
      sound: true,
      evaluator: 'Alice',
      owner: 'Carol',
      ownerSignedOff: true,
    }));
    const summary = review.readRemediationReviewSummary(
      store([...panels, ...humans]),
      samples,
      lines
    );
    expect(summary).toMatchObject({
      human: { n: 20 },
      panel: { n: 0 },
      unverifiablePanelRows: 0,
      rawPanelRows: 20,
      supersededPanelRows: 20,
      judgedSelections: 20,
    });
    const verdict = evaluateEnforceReadiness(
      buildEnforceReadinessEvidence(
        summarizeRemediationSoak(
          lines.map((line) => RemediationSoakRecordSchema.parse(JSON.parse(line)))
        ),
        summary
      ),
      {
        minShadowSelections: 20,
        minJudgedRate: 1,
        minSoundnessRate: 1,
        requireNamedEvaluator: true,
        requireNamedOwner: true,
        minOwnerSample: 10,
        maxSampleDisagreements: 0,
      }
    );
    expect(verdict.ready).toBe(true);
    expect(verdict.criteria.find((c) => c.name === 'owner-agreement')?.detail).toContain('n/a');
  });

  it('reports agreement as n/a after panels are superseded despite historical owner marks', () => {
    const human: review.ReviewRecord = {
      judgeKind: 'human',
      soakRef: panel().soakRef,
      reviewedAt: '2026-10-01T00:00:00.000Z',
      reviewed: true,
      sound: true,
      evaluator: 'Alice',
    };
    const ownerMark: review.ReviewRecord = { ...human, judgeKind: 'owner-sample', sampleId: 'old' };
    const summary = review.readRemediationReviewSummary(
      store([panel(), human, ownerMark]),
      samples,
      [raw]
    );
    const verdict = evaluateEnforceReadiness(
      buildEnforceReadinessEvidence(
        summarizeRemediationSoak([RemediationSoakRecordSchema.parse(JSON.parse(raw))]),
        summary
      )
    );
    expect(summary.unverifiablePanelRows).toBe(0);
    expect(verdict.criteria.find((c) => c.name === 'owner-agreement')).toMatchObject({
      met: true,
      detail: 'n/a — no current panel judgments', // Historical marks do not impose freshness.
    });
  });

  it.each(['missing', 'unreadable', 'not-found', 'hash'] as const)(
    'names the %s cause and recovery hint in criteria and readiness text',
    async (cause) => {
      let row = panel();
      if (cause === 'unreadable') row = panel({ voteLedgerPath: dir });
      if (cause === 'not-found') persist(vote({ id: 'different-id' }));
      if (cause === 'hash') persist({ ...vote(), hash: 'b'.repeat(64) });
      const expected =
        cause === 'missing'
          ? `missing ledger at ${ledger}`
          : cause === 'unreadable'
            ? `unreadable ledger at ${dir}`
            : cause === 'not-found'
              ? 'record id not found'
              : 'hash mismatch';
      const summary = review.readRemediationReviewSummary(store([row]), samples, [raw]);
      const verdict = evaluateEnforceReadiness(
        buildEnforceReadinessEvidence(
          summarizeRemediationSoak([RemediationSoakRecordSchema.parse(JSON.parse(raw))]),
          summary
        )
      );
      for (const name of ['judged-coverage', 'owner-agreement']) {
        const criterion = verdict.criteria.find((c) => c.name === name);
        expect(criterion?.detail).toContain(expected);
        expect(criterion?.detail).toContain('re-judge the ref by a human or re-run panel-judge');
      }
      review.createRemediationReviewStore().record(row, raw);
      writeFileSync(getRemediationSoakFile(), raw + '\n');
      let output = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        output += String(chunk);
        return true;
      });
      await handleRemediationReviewCommand(parseCliArgs(['remediation-review', 'readiness']));
      expect(output).toContain(expected);
      expect(output).toContain('re-judge the ref by a human or re-run panel-judge');
    }
  );
});
