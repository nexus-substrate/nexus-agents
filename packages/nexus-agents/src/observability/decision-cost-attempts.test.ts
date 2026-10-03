import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { AttemptTelemetrySchema, type VoterAttemptEvent } from './attempt-usage.js';
import { DecisionCostStore, type DecisionCostRecord } from './decision-cost-store.js';
import {
  summarizeConsensusDecisionTokens,
  type ConsensusDecisionTokenReport,
} from './consensus-decision-tokens.js';
import {
  buildWeatherCostSection,
  resolveWeatherDecisionCosts,
} from '../mcp/tools/weather-report-cost-inputs.js';
import { createDefaultWeatherConfig } from '../mcp/tools/weather-report-types.js';

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function event(id = 'attempt-1'): VoterAttemptEvent {
  return {
    id,
    role: 'architect',
    cli: 'claude',
    adapter: 'claude-cli',
    model: 'test-model',
    attemptKind: 'initial',
    outcome: 'final',
    usage: { kind: 'reported', input: 3, output: 2 },
  };
}

function fixture(): { dataDir: string; filePath: string } {
  const root = mkdtempOutsideRepo('decision-attempts-');
  dirs.push(root);
  mkdirSync(join(root, 'fixture-repo', '.git'), { recursive: true });
  const dataDir = join(root, 'data');
  mkdirSync(join(dataDir, 'learning'), { recursive: true });
  return { dataDir, filePath: join(dataDir, 'learning', 'decision-costs.jsonl') };
}

function record(
  events: readonly VoterAttemptEvent[],
  observableAttempts = events.length
): DecisionCostRecord {
  return new DecisionCostStore(fixture()).record({
    decisionId: 'decision',
    gate: 'consensus_vote',
    billingMode: 'plan',
    timestamp: '2026-10-03T00:00:00.000Z',
    voters: [
      {
        role: 'architect',
        inputTokens: 3,
        outputTokens: 2,
        attemptTelemetry: { events, observableAttempts },
      },
    ],
  }).record;
}

function report(
  events: readonly VoterAttemptEvent[],
  observableAttempts = events.length
): ConsensusDecisionTokenReport {
  return summarizeConsensusDecisionTokens(
    [record(events, observableAttempts)],
    [{ correlationId: 'decision', decision: 'approved' }]
  );
}

describe('immutable outer-attempt decision telemetry (#6821)', () => {
  it('persists events beside final-seat totals without adding them together', () => {
    const config = fixture();
    const writer = new DecisionCostStore(config);
    const { record: saved, persisted } = writer.record({
      decisionId: 'decision',
      gate: 'consensus_vote',
      billingMode: 'plan',
      timestamp: '2026-10-03T00:00:00.000Z',
      voters: [
        {
          role: 'architect',
          inputTokens: 3,
          outputTokens: 2,
          attemptTelemetry: {
            events: [
              { ...event('a'), outcome: 'parse_failed' },
              { ...event('b'), attemptKind: 'parse_retry' },
            ],
            observableAttempts: 2,
          },
        },
      ],
    });
    expect(persisted).toBe(true);
    expect(saved.summary.totalTokens).toBe(5);
    expect(new DecisionCostStore(config).all()[0]?.attemptTelemetry).toEqual({
      events: [
        { ...event('a'), outcome: 'parse_failed' },
        { ...event('b'), attemptKind: 'parse_retry' },
      ],
      observableAttempts: 2,
    });
  });

  it('separates observed-attempt totals, response usage coverage and unobserved calls', () => {
    const result = report(
      [event('a'), { ...event('b'), outcome: 'superseded', usage: { kind: 'unknown' } }],
      3
    );
    expect(result.totalReportedFinalSeatTokens).toBe(5);
    expect(result.attemptTelemetry).toMatchObject({
      measurement: 'lower-bound',
      scope: 'observed outer-attempt usage, not all physical attempts',
      observedAttempts: 2,
      reportedAttempts: 1,
      observableAttempts: 3,
      unobservedAttempts: 1,
      coverage: 0.5,
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
      decisionsWithTelemetry: 1,
      decisionsLackingTelemetry: 0,
    });
  });

  it('preserves explicit zero as reported and missing usage as unmeasured', () => {
    expect(
      report([{ ...event(), usage: { kind: 'reported', input: 0, output: 0 } }]).attemptTelemetry
    ).toMatchObject({ measurement: 'lower-bound', totalTokens: 0, coverage: 1 });
    expect(report([{ ...event(), usage: { kind: 'unknown' } }]).attemptTelemetry).toMatchObject({
      measurement: 'unmeasured',
      totalTokens: null,
      coverage: 0,
    });
  });

  it('names empty and legacy cohorts without inventing zero attempts', () => {
    expect(summarizeConsensusDecisionTokens([], []).attemptTelemetry).toMatchObject({
      measurement: 'unmeasured',
      totalTokens: null,
      coverage: null,
      observedAttempts: null,
    });
    const legacy = record([]);
    const { attemptTelemetry: _discard, ...withoutEvents } = legacy;
    expect(
      summarizeConsensusDecisionTokens(
        [withoutEvents],
        [{ correlationId: 'decision', decision: 'approved' }]
      ).attemptTelemetry
    ).toMatchObject({
      measurement: 'unmeasured',
      decisionsLackingTelemetry: 1,
      observedAttempts: null,
    });
    expect(report([], 1).attemptTelemetry).toMatchObject({
      measurement: 'unmeasured',
      observedAttempts: 0,
      observableAttempts: 1,
      unobservedAttempts: 1,
      coverage: null,
      totalTokens: null,
    });
  });

  it('rejects ambiguous events and contradictory observable attempt counts', () => {
    expect(
      AttemptTelemetrySchema.safeParse({ events: [event(), event()], observableAttempts: 2 })
        .success
    ).toBe(false);
    expect(
      AttemptTelemetrySchema.safeParse({ events: [event()], observableAttempts: 0 }).success
    ).toBe(false);
    expect(
      AttemptTelemetrySchema.safeParse({
        events: [{ ...event(), usage: { kind: 'reported', input: 1 } }],
        observableAttempts: 1,
      }).success
    ).toBe(false);
  });

  it('surfaces persisted response events in the weekly weather join', () => {
    const config = fixture();
    vi.stubEnv('NEXUS_DATA_DIR', config.dataDir);
    vi.stubEnv('NEXUS_REPO_PREFERRED', '0');
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    new DecisionCostStore(config).record({
      decisionId: 'weather',
      gate: 'consensus_vote',
      billingMode: 'plan',
      timestamp: new Date().toISOString(),
      voters: [
        {
          role: 'architect',
          inputTokens: 3,
          outputTokens: 2,
          attemptTelemetry: { events: [event()], observableAttempts: 2 },
        },
      ],
    });
    const section = buildWeatherCostSection(createDefaultWeatherConfig(), {
      voteRecords: [{ correlationId: 'weather', decision: 'no_quorum' }],
    });
    expect(section.consensusDecisionTokens).toMatchObject({
      matchedNoQuorumDecisions: 1,
      totalReportedFinalSeatTokens: 5,
      attemptTelemetry: { observedAttempts: 1, unobservedAttempts: 1, totalTokens: 5, coverage: 1 },
    });
  });

  it('fails closed on multiple final responses for the same role', () => {
    expect(
      AttemptTelemetrySchema.safeParse({
        events: [event('a'), event('b')],
        observableAttempts: 2,
      }).success
    ).toBe(false);
  });

  it('excludes costs whose event role does not exist in the seat summary', () => {
    const result = report([{ ...event(), role: 'nonexistent-seat' }]);
    expect(result).toMatchObject({
      invalidCostRecords: 1,
      totalReportedFinalSeatTokens: 0,
      attemptTelemetry: { measurement: 'unmeasured', totalTokens: null },
    });
  });

  it('excludes histories that reuse one response event across different decisions', () => {
    const first = record([event()]);
    const second = { ...first, decisionId: 'other-decision' };
    const result = summarizeConsensusDecisionTokens(
      [first, second],
      [
        { correlationId: 'decision', decision: 'approved' },
        { correlationId: 'other-decision', decision: 'approved' },
      ]
    );
    expect(result).toMatchObject({
      invalidCostRecords: 2,
      totalReportedFinalSeatTokens: 0,
      attemptTelemetry: { measurement: 'unmeasured', observedAttempts: null },
    });
  });

  it.each(['malformed-consensus', 'other-gate'] as const)(
    'poisons response identity shared with a %s history before filtering',
    (caseName) => {
      const first = record([event()]);
      const second: DecisionCostRecord =
        caseName === 'other-gate'
          ? { ...first, decisionId: 'other-decision', gate: 'pr_review' }
          : {
              ...first,
              decisionId: 'other-decision',
              attemptTelemetry: { events: [event()], observableAttempts: 0 },
            };
      const result = summarizeConsensusDecisionTokens(
        [first, second],
        [{ correlationId: 'decision', decision: 'approved' }]
      );
      expect(result).toMatchObject({
        invalidCostRecords: caseName === 'other-gate' ? 1 : 2,
        matchedQuorumDecisions: 0,
        totalReportedFinalSeatTokens: 0,
        attemptTelemetry: { measurement: 'unmeasured', totalTokens: null },
      });
    }
  );

  it('reads only usable identities from structurally malformed event metadata', () => {
    const first = record([event()]);
    const raw: unknown = {
      ...first,
      decisionId: 'malformed',
      attemptTelemetry: {
        events: [null, 7, {}, { id: 2 }, { id: event().id }],
        observableAttempts: 5,
      },
    };
    const result = summarizeConsensusDecisionTokens(
      [first, raw as DecisionCostRecord],
      [{ correlationId: 'decision', decision: 'approved' }]
    );
    expect(result).toMatchObject({
      invalidCostRecords: 2,
      totalReportedFinalSeatTokens: 0,
      attemptTelemetry: { measurement: 'unmeasured', totalTokens: null },
    });
  });

  it('keeps hydrated reported and unknown usage immutable', () => {
    const config = fixture();
    const saved = record([
      event('reported'),
      {
        ...event('unknown'),
        outcome: 'superseded',
        usage: { kind: 'unknown' },
      },
    ]);
    writeFileSync(config.filePath, `${JSON.stringify(saved)}\n`);
    const events = new DecisionCostStore(config).all()[0]?.attemptTelemetry?.events;
    expect(events).toHaveLength(2);
    for (const observed of events ?? []) {
      expect(Object.isFrozen(observed.usage)).toBe(true);
      expect(Reflect.set(observed.usage, 'input', 99)).toBe(false);
    }
    expect(events?.[0]?.usage).toEqual({ kind: 'reported', input: 3, output: 2 });
    expect(events?.[1]?.usage).toEqual({ kind: 'unknown' });
  });

  it('fails closed on corrupt persisted event histories', () => {
    const config = fixture();
    const saved = record([event()]);
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(
      config.filePath,
      `${JSON.stringify({ ...saved, attemptTelemetry: { events: [event(), event()], observableAttempts: 2 } })}\n`
    );
    const reader = new DecisionCostStore(config);
    expect(reader.hydrationComplete).toBe(false);
    vi.stubEnv('NEXUS_DATA_DIR', config.dataDir);
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    vi.stubEnv('NEXUS_REPO_PREFERRED', '0');
    expect(() => resolveWeatherDecisionCosts(0)).toThrow(/invalid.*decision cost/i);
  });
});
