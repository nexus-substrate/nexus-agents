import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { persistVoteRecord, resolveVoteRecordsPath } from '../audit/vote-record-store.js';
import type { recordAuthenticVote as AuthenticVoteRecorder } from '../mcp/tools/consensus-vote-recording.js';
import { handleRemediationReviewCommand } from './remediation-review-command.js';
import { parseCliArgs } from '../cli.js';
import {
  _resetRemediationSoakSinkForTests,
  createRemediationSoakSink,
  getRemediationSoakFile,
  RemediationSoakRecordSchema,
} from '../mcp/tools/improvement-remediation-shadow.js';
import {
  _resetRemediationReviewStoreForTests,
  createRemediationReviewStore,
  getRemediationReviewFile,
} from '../mcp/tools/remediation-review.js';

const { executeVoting, recordAuthenticVote } = vi.hoisted(() => ({
  executeVoting: vi.fn(),
  recordAuthenticVote: vi.fn(),
}));
vi.mock('../mcp/tools/consensus-vote.js', () => ({ executeVoting }));
vi.mock('../mcp/tools/consensus-vote-recording.js', () => ({ recordAuthenticVote }));

let dir: string;
let previous: string | undefined;
let output: string;

function seedSoak(index = 0): string {
  const record = {
    signalKey: `routing:floor:${String(index)}`,
    timestamp: '2026-10-01T00:00:00.000Z',
    category: 'routing' as const,
    priority: 'p2' as const,
    severity: 'warning' as const,
    planStepCount: 3,
    reason: 'higher_order: approved (100%)',
    dryRunResult: 'higher_order: approved (100%): earlier panel approved',
    voteOutcome: { approved: true, approvalPercentage: 100 },
  };
  createRemediationSoakSink(getRemediationSoakFile()).record(record);
  _resetRemediationSoakSinkForTests();
  return `${record.signalKey}::${record.timestamp}`;
}

function command(...argv: string[]): ReturnType<typeof handleRemediationReviewCommand> {
  return handleRemediationReviewCommand(parseCliArgs(['remediation-review', ...argv]));
}

function reviews(): ReturnType<ReturnType<typeof createRemediationReviewStore>['getRecords']> {
  return createRemediationReviewStore(getRemediationReviewFile()).getRecords();
}

beforeEach(() => {
  dir = mkdtempSync(join(process.cwd(), '.review-panel-test-'));
  previous = process.env['NEXUS_DATA_DIR'];
  process.env['NEXUS_DATA_DIR'] = dir;
  _resetRemediationSoakSinkForTests();
  _resetRemediationReviewStoreForTests();
  output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });
  executeVoting.mockReset().mockResolvedValue({
    decision: 'approved',
    strategy: 'higher_order',
    errorPolicy: 'absolute_quorum',
    simulateVotes: false,
    result: { outcome: 'approved' },
    votes: [{ source: 'llm' }],
  });
  recordAuthenticVote
    .mockReset()
    .mockImplementation((args: Parameters<typeof AuthenticVoteRecorder>[0]) => {
      const sound = args.resolvedDecision === 'approved';
      const record = persistVoteRecord({
        ...args,
        strategy: 'higher_order',
        id: `vote-panel-${String(recordAuthenticVote.mock.calls.length)}`,
        result: {
          ...args.result,
          approvalPercentage: sound ? 100 : 0,
          voteCounts: { approve: sound ? 1 : 0, reject: sound ? 0 : 1, abstain: 0, total: 1 },
        },
        votes: [
          {
            role: 'architect',
            source: 'llm',
            processingTimeMs: 1,
            vote: {
              decision: sound ? 'approve' : 'reject',
              confidence: 1,
              reasoning: 'Independent judgment of the supplied signal and selected remediation.',
            },
          },
        ],
      });
      return Promise.resolve(
        record === undefined
          ? { persisted: false, detail: 'test ledger persistence failed' }
          : { persisted: true, record, path: resolveVoteRecordsPath() }
      );
    });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (previous === undefined) delete process.env['NEXUS_DATA_DIR'];
  else process.env['NEXUS_DATA_DIR'] = previous;
  _resetRemediationSoakSinkForTests();
  _resetRemediationReviewStoreForTests();
  rmSync(dir, { recursive: true, force: true });
});

describe('remediation batch panel', () => {
  it('wires the real voting entry point and persistence with full live higher-order quorum', async () => {
    seedSoak();
    await command('panel-judge', '--batch', '1', '--format', 'json');
    expect(executeVoting).toHaveBeenCalledTimes(1);
    expect(executeVoting.mock.calls[0]?.[0]).toMatchObject({
      strategy: 'higher_order',
      errorPolicy: 'absolute_quorum',
      quickMode: false,
      simulateVotes: false,
    });
    expect(recordAuthenticVote).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: 'higher_order',
        resolvedDecision: 'approved',
        errorPolicy: 'absolute_quorum',
      })
    );
    expect(reviews()[0]).toMatchObject({
      judgeKind: 'panel',
      evaluator: 'panel:vote-panel-1',
      voteRecordId: 'vote-panel-1',
      sound: true,
    });
    expect(reviews()[0]?.owner).toBeUndefined();
  });

  it('allowlists independent evidence and binds the exact realistic soak line', async () => {
    seedSoak();
    const original = readFileSync(getRemediationSoakFile(), 'utf8').trimEnd();
    const raw = original
      .replace('{', '{  ')
      .replace(/}$/, ',"futureVoteText":"higher_order: approved (100%)"}');
    writeFileSync(getRemediationSoakFile(), `${raw}\n`);
    await command('panel-judge', '--batch', '1');
    const proposal = executeVoting.mock.calls[0]?.[0]?.proposal as string;
    expect(proposal).toContain('Was this remediation selection sound?');
    expect(proposal).not.toContain('higher_order: approved (100%)');
    const evidence = JSON.parse(proposal.split('\n').slice(1).join('\n')) as unknown;
    expect(evidence).toEqual({
      soakRecordHash: createHash('sha256').update(raw).digest('hex'),
      signalKey: 'routing:floor:0',
      timestamp: '2026-10-01T00:00:00.000Z',
      category: 'routing',
      priority: 'p2',
      severity: 'warning',
      planStepCount: 3,
    });
    expect(recordAuthenticVote.mock.calls[0]?.[0]?.proposal).toBe(proposal);
    expect(reviews()[0]).toHaveProperty(
      'soakRecordHash',
      createHash('sha256').update(raw).digest('hex')
    );
  });

  it('retains verifiable panel provenance when the vote ledger clips a long proposal', async () => {
    seedSoak();
    const raw = readFileSync(getRemediationSoakFile(), 'utf8');
    writeFileSync(
      getRemediationSoakFile(),
      raw.replace('routing:floor:0', `routing:${'detail'.repeat(100)}`)
    );
    await command('panel-judge', '--batch', '1');
    expect(executeVoting.mock.calls[0]?.[0]?.proposal.length).toBeGreaterThan(500);
    output = '';
    await command('readiness', '--format', 'json');
    expect(JSON.parse(output)).toMatchObject({ evidence: { panel: { n: 1 } } });
  });

  it('skips malformed soak lines, reports their count and judges valid records', async () => {
    seedSoak();
    const raw = readFileSync(getRemediationSoakFile(), 'utf8');
    writeFileSync(getRemediationSoakFile(), `broken JSON\n${raw}{"signalKey":"missing-fields"}\n`);
    await expect(
      command('panel-judge', '--batch', '3', '--format', 'json')
    ).resolves.toHaveProperty('exitCode', 0);
    expect(JSON.parse(output)).toMatchObject({
      judged: 1,
      attempted: 1,
      malformedSoakLines: 2,
      failures: [],
    });
    expect(reviews()).toHaveLength(1);
    expect(executeVoting).toHaveBeenCalledTimes(1);
    output = '';
    await command('panel-judge', '--batch', '3');
    expect(output).toContain('2 malformed soak line(s) skipped');
  });

  it('pins the persisted ledger while judging in repo cwd and verifies from a different cwd', async () => {
    seedSoak();
    const ledgerPath = join(dir, 'repo-local', 'governance', 'vote-records.jsonl');
    const previousLedgerPath = process.env['NEXUS_VOTE_RECORDS_PATH'];
    process.env['NEXUS_VOTE_RECORDS_PATH'] = ledgerPath;
    try {
      await command('panel-judge', '--batch', '1');
      expect(reviews()[0]).toHaveProperty('voteLedgerPath', ledgerPath);
      delete process.env['NEXUS_VOTE_RECORDS_PATH'];
      vi.spyOn(process, 'cwd').mockReturnValue('/a/different/workspace');
      output = '';
      await command('readiness', '--format', 'json');
      expect(JSON.parse(output)).toMatchObject({
        evidence: { panel: { n: 1 }, unverifiablePanelRows: 0 },
      });
    } finally {
      if (previousLedgerPath === undefined) delete process.env['NEXUS_VOTE_RECORDS_PATH'];
      else process.env['NEXUS_VOTE_RECORDS_PATH'] = previousLedgerPath;
    }
  });

  it('skips and reports all duplicate soak refs while judging the unambiguous remainder', async () => {
    const duplicateRef = seedSoak(0);
    const duplicateLine = readFileSync(getRemediationSoakFile(), 'utf8');
    seedSoak(1);
    seedSoak(2);
    const original = readFileSync(getRemediationSoakFile(), 'utf8');
    writeFileSync(getRemediationSoakFile(), `${original}${duplicateLine}${duplicateLine}`);
    await expect(
      command('panel-judge', '--batch', '3', '--format', 'json')
    ).resolves.toHaveProperty('exitCode', 0);
    expect(JSON.parse(output)).toMatchObject({
      judged: 2,
      attempted: 2,
      duplicateSoakRefs: [duplicateRef],
      failures: [],
    });
    expect(reviews()).toHaveLength(2);
    expect(reviews().map((row) => row.soakRef)).not.toContain(duplicateRef);
    expect(executeVoting).toHaveBeenCalledTimes(2);
  });

  it('parses the soak snapshot once before voting and never reparses after each vote', async () => {
    seedSoak(0);
    seedSoak(1);
    seedSoak(2);
    const parse = vi.spyOn(RemediationSoakRecordSchema, 'parse');
    const countsAtVote: number[] = [];
    executeVoting.mockImplementation(() => {
      countsAtVote.push(parse.mock.calls.length);
      return Promise.resolve({ decision: 'approved', votes: [{ source: 'llm' }], result: {} });
    });
    await command('panel-judge', '--batch', '3');
    expect(countsAtVote).toHaveLength(3);
    expect(countsAtVote[0]).toBe(4);
    // Each next proposal parses its own target; the whole soak snapshot stays cached.
    expect(countsAtVote[1]).toBe((countsAtVote[0] ?? 0) + 1);
    expect(countsAtVote[2]).toBe((countsAtVote[1] ?? 0) + 1);
    expect(reviews()).toHaveLength(3);
  });

  it('quick uses the three-seat path and batch limits the number of votes', async () => {
    seedSoak(0);
    seedSoak(1);
    seedSoak(2);
    await command('panel-judge', '--batch', '2', '--quick');
    expect(executeVoting).toHaveBeenCalledTimes(2);
    expect(executeVoting.mock.calls[0]?.[0]).toHaveProperty('quickMode', true);
    expect(reviews()).toHaveLength(2);
  });

  it('no_quorum records no judgment and reports the unjudged ref', async () => {
    const ref = seedSoak();
    executeVoting.mockResolvedValue({ decision: 'no_quorum', votes: [{ source: 'llm' }] });
    await command('panel-judge', '--batch', '1', '--format', 'json');
    expect(reviews()).toHaveLength(0);
    expect(recordAuthenticVote).not.toHaveBeenCalled();
    expect(output).toContain('no_quorum');
    expect(output).toContain(ref);
  });

  it('engine errors record nothing and are reported', async () => {
    seedSoak();
    executeVoting.mockRejectedValue(new Error('adapter unavailable'));
    await command('panel-judge', '--batch', '1');
    expect(reviews()).toHaveLength(0);
    expect(output).toContain('adapter unavailable');
  });

  it('persistence errors cannot produce a review without durable provenance', async () => {
    seedSoak();
    recordAuthenticVote.mockResolvedValue({ persisted: false, detail: 'write failed' });
    await command('panel-judge', '--batch', '1');
    expect(reviews()).toHaveLength(0);
    expect(output).toContain('write failed');
  });

  it('a rejected vote records unsound rather than skipping the verdict', async () => {
    seedSoak();
    executeVoting.mockResolvedValue({
      decision: 'rejected',
      votes: [{ source: 'llm' }],
      result: { outcome: 'rejected' },
      strategy: 'higher_order',
      errorPolicy: 'absolute_quorum',
    });
    await command('panel-judge', '--batch', '1');
    expect(reviews()[0]?.sound).toBe(false);
  });

  it('empty pending set reports zero and records nothing', async () => {
    await command('panel-judge', '--batch', '5', '--format', 'json');
    expect(JSON.parse(output)).toMatchObject({ judged: 0 });
    expect(reviews()).toHaveLength(0);
    expect(executeVoting).not.toHaveBeenCalled();
    expect(recordAuthenticVote).not.toHaveBeenCalled();
  });

  it('refuses an invalid batch size', async () => {
    await expect(command('panel-judge', '--batch', '0')).rejects.toThrow(/batch/);
  });

  it('requires an owner name when drawing a sample', async () => {
    seedSoak();
    await command('panel-judge', '--batch', '1');
    await expect(command('sample', '--n', '1')).rejects.toThrow(/named --owner is required/);
    await expect(command('sample', '--owner', '  ')).rejects.toThrow(/named --owner is required/);
  });

  it('keeps carol disagreement unresolved after mallory marks with --owner mallory', async () => {
    const ref = seedSoak();
    await command('panel-judge', '--batch', '1');
    output = '';
    await command('sample', '--n', '1', '--owner', 'carol', '--format', 'json');
    const { sample } = JSON.parse(output) as { sample: { id: string; owner: string } };
    expect(sample.owner).toBe('carol');
    await command('mark', ref, '--sample', sample.id, '--evaluator', 'carol', '--unsound');
    await expect(command('sign-off', '--owner', 'mallory')).rejects.toThrow(
      /recorded sample owner/
    );
    await command(
      'mark',
      ref,
      '--sample',
      sample.id,
      '--evaluator',
      'mallory',
      '--owner',
      'mallory',
      '--sound'
    );
    // Sample context cannot turn a non-owner mark into a superseding human review.
    expect(reviews().at(-1)).toMatchObject({ judgeKind: 'owner-sample', evaluator: 'mallory' });
    output = '';
    await command('readiness', '--format', 'json');
    expect(JSON.parse(output)).toMatchObject({
      evidence: { human: { n: 0 }, panel: { n: 1 }, sample: { disagreements: 1 } },
    });
  });

  it('draws and confirms a rejection after human override without a prior sample', async () => {
    const ref = seedSoak();
    executeVoting.mockResolvedValue({
      decision: 'rejected',
      votes: [{ source: 'llm' }],
      result: { outcome: 'rejected' },
      strategy: 'higher_order',
      errorPolicy: 'absolute_quorum',
    });
    await command('panel-judge', '--batch', '1');
    await command('mark', ref, '--evaluator', 'human', '--sound');
    output = '';
    await command('readiness', '--format', 'json');
    expect(output).toContain(
      '1 panel rejections overridden by human; 1 without owner confirmation'
    );
    output = '';
    await command('sample', '--n', '1', '--owner', 'owner', '--format', 'json');
    const { sample } = JSON.parse(output) as { sample: { id: string; refs: string[] } };
    expect(sample.refs).toEqual([ref]);
    await command('mark', ref, '--sample', sample.id, '--evaluator', 'owner', '--sound');
    output = '';
    await command('readiness', '--format', 'json');
    expect(output).toContain('1 panel rejections overridden by human; all owner-confirmed');
    await command('sign-off', '--owner', 'owner');
    output = '';
    await command('readiness', '--format', 'json');
    const report = JSON.parse(output) as { criteria: { name: string; met: boolean }[] };
    expect(report.criteria.find((criterion) => criterion.name === 'owner-agreement')?.met).toBe(
      true
    );
    expect(report.criteria.find((criterion) => criterion.name === 'named-owner')?.met).toBe(true);
    output = '';
    await command('readiness');
    expect(output).toContain('1 panel rejections overridden by human');
  });

  it('sample persists refs and seed; sign-off refuses unjudged sample refs', async () => {
    seedSoak();
    await command('panel-judge', '--batch', '1');
    output = '';
    await command(
      'sample',
      '--n',
      '1',
      '--owner',
      'owner',
      '--seed',
      'reproducible',
      '--format',
      'json'
    );
    const parsed = JSON.parse(output) as { sample: { id: string; seed: string; refs: string[] } };
    expect(parsed.sample.seed).toBe('reproducible');
    expect(parsed.sample.refs).toHaveLength(1);
    await expect(command('sign-off', '--owner', 'owner')).rejects.toThrow(/unjudged/);
    await command(
      'mark',
      parsed.sample.refs[0] ?? '',
      '--sample',
      parsed.sample.id,
      '--evaluator',
      'owner',
      '--sound'
    );
    expect(reviews()[1]).toMatchObject({ judgeKind: 'owner-sample', sampleId: parsed.sample.id });
    await command('sign-off', '--owner', 'owner');
    expect(reviews().filter((r) => r.evaluator.startsWith('panel:'))).toHaveLength(1);
    expect(reviews()[0]?.owner).toBeUndefined();
  });

  it('readiness reports human, panel and owner-sample judgments separately in JSON and text', async () => {
    seedSoak();
    await command('panel-judge', '--batch', '1');
    output = '';
    await command('sample', '--n', '1', '--owner', 'owner', '--format', 'json');
    const parsed = JSON.parse(output) as { sample: { id: string; refs: string[] } };
    await command(
      'mark',
      parsed.sample.refs[0] ?? '',
      '--sample',
      parsed.sample.id,
      '--evaluator',
      'owner',
      '--unsound'
    );
    output = '';
    await command('readiness', '--format', 'json');
    expect(JSON.parse(output)).toMatchObject({
      evidence: {
        human: { n: 0 },
        panel: { n: 1 },
        sample: { n: 1, disagreements: 1 },
        judgedSelections: 1,
        sampledSelections: 1,
      },
    });
    output = '';
    await command('readiness');
    expect(output).toContain('human 0');
    expect(output).toContain('panel 1');
    expect(output).toContain('sample 1 (1 disagreements)');
    expect(output).toContain('[FAIL] owner-agreement');
  });

  it('a changed soak artifact returns to pending and receives a fresh panel judgment', async () => {
    seedSoak();
    await command('panel-judge', '--batch', '1');
    const raw = readFileSync(getRemediationSoakFile(), 'utf8');
    writeFileSync(
      getRemediationSoakFile(),
      raw.replace('higher_order: approved (100%)', 'higher_order: rejected (0%)')
    );
    await command('panel-judge', '--batch', '1');
    expect(executeVoting).toHaveBeenCalledTimes(2);
    expect(reviews()).toHaveLength(2);
  });

  it('sample refuses panel evidence whose soak hash is stale', async () => {
    seedSoak();
    await command('panel-judge', '--batch', '1');
    const raw = readFileSync(getRemediationSoakFile(), 'utf8');
    writeFileSync(
      getRemediationSoakFile(),
      raw.replace('higher_order: approved (100%)', 'higher_order: rejected (0%)')
    );
    await expect(command('sample', '--n', '1', '--owner', 'owner')).rejects.toThrow(
      /No panel-judged/
    );
  });

  it('changes during voting cannot be recorded as a judgment of the replacement artifact', async () => {
    seedSoak();
    executeVoting.mockImplementationOnce(() => {
      const raw = readFileSync(getRemediationSoakFile(), 'utf8');
      writeFileSync(
        getRemediationSoakFile(),
        raw.replace('higher_order: approved (100%)', 'higher_order: rejected (0%)')
      );
      return Promise.resolve({ decision: 'approved', votes: [{ source: 'llm' }], result: {} });
    });
    await command('panel-judge', '--batch', '1');
    expect(reviews()).toHaveLength(0);
    expect(output).toContain('hash mismatch');
  });

  it('does not accept an errored or simulated seat even if the engine reports approval', async () => {
    seedSoak();
    executeVoting.mockResolvedValue({
      decision: 'approved',
      votes: [{ source: 'simulation' }],
      result: {},
    });
    await command('panel-judge', '--batch', '1');
    expect(reviews()).toHaveLength(0);
    expect(recordAuthenticVote).not.toHaveBeenCalled();
  });

  it('signs off a fresh completed sample after its predecessor artifact was replaced', async () => {
    seedSoak();
    await command('panel-judge', '--batch', '1');
    await command('sample', '--n', '1', '--owner', 'owner');
    const raw = readFileSync(getRemediationSoakFile(), 'utf8');
    writeFileSync(
      getRemediationSoakFile(),
      raw.replace('higher_order: approved (100%)', 'higher_order: rejected (0%)')
    );
    await command('panel-judge', '--batch', '1');
    output = '';
    await command('sample', '--n', '1', '--owner', 'owner', '--format', 'json');
    const parsed = JSON.parse(output) as { sample: { id: string; refs: string[] } };
    await command(
      'mark',
      parsed.sample.refs[0] ?? '',
      '--sample',
      parsed.sample.id,
      '--evaluator',
      'owner',
      '--sound'
    );
    await expect(command('sign-off', '--owner', 'owner')).resolves.toHaveProperty('exitCode', 0);
    expect(
      reviews()
        .filter((r) => r.judgeKind === 'panel')
        .some((r) => r.owner !== undefined)
    ).toBe(false);
  });
});
