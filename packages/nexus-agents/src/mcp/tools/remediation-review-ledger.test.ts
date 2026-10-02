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
} from './improvement-remediation-shadow.js';
import { evaluateEnforceReadiness } from './improvement-enforce-readiness.js';
import { handleRemediationReviewCommand } from '../../cli/remediation-review-command.js';
import { parseCliArgs } from '../../cli.js';
import { buildEnforceReadinessEvidence } from './remediation-readiness-collector.js';

const raw = JSON.stringify({
  signalKey: 'testing:coverage:cli-adapters',
  timestamp: '2026-09-29T12:00:00.000Z',
  category: 'testing',
  priority: 'p2',
  severity: 'warning',
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
