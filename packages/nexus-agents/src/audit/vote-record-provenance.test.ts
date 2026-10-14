/** Distinct requested, resolved and assigned voter provenance (#7333). */
import { describe, expect, it, vi } from 'vitest';
import type { ILogger } from '../core/index.js';
import type { AgentVoteResult } from '../cli/vote-types.js';
import { UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';
import { buildVoteRecord, parseVoteRecordsText } from './vote-record-store.js';
import { computeVoteRecordHash, verifyVoteRecordSet, VoterSummarySchema } from './vote-record.js';
import type { VoteRecord } from './vote-record.js';

const CONFIGURED = 'claude-fable-5';
const REPORTED = 'opus';
const RESOLVED = 'claude-opus';
const NOW = '2026-10-14T00:00:00.000Z';

function seat(overrides: Partial<AgentVoteResult> = {}): AgentVoteResult {
  return {
    role: 'architect',
    source: 'llm',
    processingTimeMs: 1,
    model: CONFIGURED,
    pinnedModel: CONFIGURED,
    cli: 'cli-claude',
    servedModel: REPORTED,
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'Read actual artifact' },
    ...overrides,
  };
}

function build(votes: readonly AgentVoteResult[] = [seat()], logger?: ILogger): VoteRecord {
  const responded = votes.filter((v) => v.source !== 'error');
  return buildVoteRecord({
    id: 'provenance-test',
    proposal: 'Preserve model provenance',
    strategy: 'supermajority',
    declaredOptions: undefined,
    resolvedDecision: responded.length === 0 ? 'no_quorum' : 'approved',
    errorPolicy: 'absolute_quorum',
    logger,
    votes,
    result: {
      proposalId: 'provenance-test',
      proposal: { title: 'Provenance', description: 'test', algorithm: 'supermajority' },
      outcome: 'approved',
      votes: new Map(),
      voteCounts: { approve: responded.length, reject: 0, abstain: 0, total: responded.length },
      approvalPercentage: responded.length === 0 ? 0 : 100,
      quorumReached: responded.length > 0,
      startedAt: NOW,
      closedAt: NOW,
      durationMs: 1,
    },
  });
}

function expectReadable(record: ReturnType<typeof build>): void {
  const parsed = parseVoteRecordsText(JSON.stringify(record));
  expect(parsed.invalidLines).toEqual([]);
  expect(parsed.records).toEqual([record]);
  expect(verifyVoteRecordSet(parsed.records)).toEqual({ ok: true, recordCount: 1 });
}

function warningLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;
}

describe('voter model provenance (#7333, option B)', () => {
  it('preserves conditions and their digest tier alongside identity evidence', () => {
    const record = build([
      seat({
        vote: {
          decision: 'approve',
          confidence: 0.9,
          reasoning: 'Read actual artifact',
          conditions: ['Owner must ratify the exact head'],
        },
      }),
    ]);
    expect(record.version).toBe('1.15');
    expect(record.voters[0]).toMatchObject({
      resolvedModel: RESOLVED,
      assignedModel: CONFIGURED,
      conditions: ['Owner must ratify the exact head'],
    });
    expectReadable(record);
  });

  it('keeps the request and raw report beside qualified resolved and assigned identities', () => {
    const record = build();
    expect(record.version).toBe('1.13');
    expect(record.voters[0]).toMatchObject({
      model: CONFIGURED,
      servedModel: REPORTED,
      resolvedModel: RESOLVED,
      assignedModel: CONFIGURED,
    });
    expectReadable(record);
  });

  it('preserves the primary assignment across a cross-CLI fallback', () => {
    const record = build([
      seat({
        model: 'gpt-6.1-sol',
        cli: 'cli-codex',
        servedModel: 'gpt-6.1-sol',
        fallback: { fromCli: 'claude', fromModel: CONFIGURED, reason: 'capacity' },
      }),
    ]);
    expect(record.voters[0]).toMatchObject({
      model: 'gpt-6.1-sol',
      resolvedModel: 'gpt-6.1-sol',
      assignedModel: CONFIGURED,
      fallback: { fromCli: 'claude', fromModel: CONFIGURED, reason: 'capacity' },
    });
    expectReadable(record);
  });

  it('qualifies a traced fallback assignment when there is no pin', () => {
    const record = build([
      seat({
        pinnedModel: undefined,
        fallback: { fromCli: 'claude', fromModel: 'fable', reason: 'capacity' },
      }),
    ]);
    expect(record.voters[0]).toHaveProperty('assignedModel', CONFIGURED);
    expectReadable(record);
  });

  it('does not infer an assignment from an untraced fallback', () => {
    const record = build([
      seat({ pinnedModel: undefined, fallback: { fromCli: 'codex', reason: 'capacity' } }),
    ]);
    expect(record.voters[0]).toHaveProperty('resolvedModel', RESOLVED);
    expect(record.voters[0]).not.toHaveProperty('assignedModel');
    expectReadable(record);
  });

  it.each([undefined, '', UNRESOLVED_MODEL_ID])(
    'falls back to request without inventing a report for %j',
    (servedModel) => {
      const record = build([seat({ servedModel })]);
      expect(record.voters[0]).toHaveProperty('resolvedModel', CONFIGURED);
      if (servedModel === undefined || servedModel === '')
        expect(record.voters[0]).not.toHaveProperty('servedModel');
      expectReadable(record);
    }
  );

  it('does not invent a request or assignment when only a report exists', () => {
    const record = build([seat({ model: undefined, pinnedModel: undefined })]);
    expect(record.voters[0]).toHaveProperty('resolvedModel', RESOLVED);
    expect(record.voters[0]).not.toHaveProperty('model');
    expect(record.voters[0]).not.toHaveProperty('assignedModel');
    expectReadable(record);
  });

  it('omits unavailable identities rather than storing placeholders', () => {
    const record = build([
      seat({
        model: UNRESOLVED_MODEL_ID,
        pinnedModel: UNRESOLVED_MODEL_ID,
        servedModel: undefined,
      }),
    ]);
    for (const key of ['model', 'servedModel', 'resolvedModel', 'assignedModel'])
      expect(record.voters[0]).not.toHaveProperty(key);
    expectReadable(record);
  });

  it('preserves a valid identity beyond the MCP display bound without truncation', () => {
    const identity = `anthropic/${'x'.repeat(170)}`;
    const record = build([seat({ model: identity, pinnedModel: identity, servedModel: identity })]);
    expect(record.voters[0]).toMatchObject({
      model: identity,
      servedModel: identity,
      resolvedModel: identity,
      assignedModel: identity,
    });
    expectReadable(record);
  });

  it.each(
    [null, 123, {}, [], '', 'x'.repeat(201), 'bad model', 'bad\nmodel'].map((value) => ({ value }))
  )(
    'warns and omits malformed report $value without losing valid provenance or vote',
    ({ value }) => {
      const logger = warningLogger();
      const malformed = { ...seat(), servedModel: value } as unknown as AgentVoteResult;
      const record = build([malformed], logger);
      expect(record.voters[0]).toMatchObject({
        model: CONFIGURED,
        resolvedModel: CONFIGURED,
        assignedModel: CONFIGURED,
      });
      expect(record.voters[0]).not.toHaveProperty('servedModel');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('servedModel'), {
        role: 'architect',
        ...(typeof value === 'string' ? { length: value.length } : { type: typeof value }),
      });
      expectReadable(record);
    }
  );

  it.each([null, 123, {}, [], 'x'.repeat(201)].map((value) => ({ value })))(
    'omits malformed pin $value and keeps other evidence',
    ({ value }) => {
      const logger = warningLogger();
      const malformed = { ...seat(), pinnedModel: value } as unknown as AgentVoteResult;
      const record = build([malformed], logger);
      expect(record.voters[0]).toHaveProperty('resolvedModel', RESOLVED);
      expect(record.voters[0]).toHaveProperty('assignedModel', CONFIGURED);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('pinnedModel'),
        expect.anything()
      );
      expectReadable(record);
    }
  );

  it.each([null, 123, {}, [], '', 'x'.repeat(201)].map((value) => ({ value })))(
    'validates malformed configured identity $value and CLI runtime types before resolution',
    ({ value }) => {
      const logger = warningLogger();
      const malformed = {
        ...seat(),
        model: value,
        pinnedModel: undefined,
        cli: null,
      } as unknown as AgentVoteResult;
      const record = build([malformed], logger);
      expect(record.voters[0]).not.toHaveProperty('model');
      expect(record.voters[0]).not.toHaveProperty('assignedModel');
      expect(record.voters[0]).toHaveProperty('resolvedModel', REPORTED);
      expectReadable(record);
      expect(logger.warn).toHaveBeenCalled();
    }
  );

  it.each([null, 123, {}, [], '', 'x'.repeat(201)].map((value) => ({ value })))(
    'omits malformed fallback model $value without inferring an assignment or losing the vote',
    ({ value }) => {
      const logger = warningLogger();
      const malformed = {
        ...seat({ pinnedModel: undefined }),
        fallback: { fromCli: 'claude', fromModel: value, reason: 'capacity' },
      } as unknown as AgentVoteResult;
      const record = build([malformed], logger);
      expect(record.voters[0]).not.toHaveProperty('assignedModel');
      expect(record.voters[0]).toHaveProperty('resolvedModel', RESOLVED);
      expect(record.voters[0]?.fallback).toEqual({ fromCli: 'claude', reason: 'capacity' });
      expectReadable(record);
      expect(logger.warn).toHaveBeenCalled();
    }
  );

  it('keeps errored and empty panel coverage distinct from responding identity evidence', () => {
    const record = build([seat(), seat({ role: 'security', source: 'error' })]);
    expect(record.voters).toHaveLength(1);
    expect(record.panelCoverage).toEqual({
      requested: 2,
      responded: 1,
      errored: 1,
      erroredRoles: ['security'],
    });
    expectReadable(record);
    const empty = build([]);
    expect(empty.voters).toEqual([]);
    expect(empty.decision).toBe('no_quorum');
    expectReadable(empty);
    const errored = build([seat({ source: 'error' })]);
    expect(errored.voters).toEqual([]);
    expect(errored.panelCoverage).toEqual({
      requested: 1,
      responded: 0,
      errored: 1,
      erroredRoles: ['architect'],
    });
    expectReadable(errored);
  });

  it.each(['resolvedModel', 'assignedModel'] as const)(
    'hash-covers adding, removing and changing %s without a version bump',
    (key) => {
      const record = build();
      const voter = record.voters[0]!;
      const { [key]: _omitted, ...bare } = voter as typeof voter & Record<string, unknown>;
      const without = { ...record, voters: [bare] };
      expect(computeVoteRecordHash(without)).not.toBe(record.hash);
      const changed = { ...record, voters: [{ ...voter, [key]: 'gpt-6.1-sol' }] };
      expect(computeVoteRecordHash(changed)).not.toBe(record.hash);
      expect(verifyVoteRecordSet([changed]).ok).toBe(false);
      expectReadable({ ...changed, hash: computeVoteRecordHash(changed) });
      const explicitAbsent = { ...record, voters: [{ ...bare, [key]: undefined }] };
      expect(computeVoteRecordHash(explicitAbsent)).toBe(computeVoteRecordHash(without));
    }
  );

  it.each(['resolvedModel', 'assignedModel'] as const)('bounds %s without clipping', (key) => {
    const voter = { role: 'architect', decision: 'approve', confidence: 0.9 };
    expect(VoterSummarySchema.safeParse({ ...voter, [key]: 'x'.repeat(200) }).success).toBe(true);
    for (const value of ['', 'x'.repeat(201), null, 123, {}])
      expect(VoterSummarySchema.safeParse({ ...voter, [key]: value }).success).toBe(false);
  });
});
