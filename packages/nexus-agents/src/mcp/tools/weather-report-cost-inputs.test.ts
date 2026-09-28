import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDecisionCostFile } from '../../config/learning-persistence.js';
import { DecisionCostStore } from '../../observability/decision-cost-store.js';
import {
  resolveWeatherDecisionCosts,
  resolveWeatherVoteRecords,
} from './weather-report-cost-inputs.js';

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('resolveWeatherVoteRecords', () => {
  it('refuses a partially unreadable runtime ledger instead of claiming a complete join', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weather-vote-ledger-'));
    dirs.push(dir);
    const path = join(dir, 'vote-records.jsonl');
    writeFileSync(path, 'not-json\n', 'utf8');
    vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', path);
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');

    expect(() => resolveWeatherVoteRecords(0)).toThrow(/invalid.*vote ledger/i);
  });

  it('does not read the host ledger for an injected cost snapshot', () => {
    expect(resolveWeatherVoteRecords(0, undefined, true)).toEqual([]);
  });
});

describe('resolveWeatherDecisionCosts', () => {
  it('refuses a durable valid-plus-schema-invalid duplicate instead of joining the surviving row', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weather-cost-ledger-'));
    dirs.push(dir);
    vi.stubEnv('NEXUS_DATA_DIR', dir);
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    const path = getDecisionCostFile();
    const writer = new DecisionCostStore();
    const { record } = writer.record({
      decisionId: 'duplicated-decision',
      gate: 'consensus_vote',
      voters: [{ role: 'reviewer', model: 'test-model', inputTokens: 1, outputTokens: 1 }],
      billingMode: 'plan',
      timestamp: new Date().toISOString(),
    });
    appendFileSync(path, `${JSON.stringify({ ...record, summary: 'corrupt' })}\n`);

    expect(() => resolveWeatherDecisionCosts(0)).toThrow(/invalid.*decision cost/i);
  });

  it('refuses malformed JSONL rather than reporting surviving cost rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weather-cost-ledger-'));
    dirs.push(dir);
    vi.stubEnv('NEXUS_DATA_DIR', dir);
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    new DecisionCostStore();
    appendFileSync(getDecisionCostFile(), '{ not json\n');

    expect(() => resolveWeatherDecisionCosts(0)).toThrow(/invalid.*decision cost/i);
  });

  it('remains incomplete across reopen when over-cap retention meets a malformed duplicate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weather-cost-ledger-'));
    dirs.push(dir);
    vi.stubEnv('NEXUS_DATA_DIR', dir);
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    const path = getDecisionCostFile();
    const { record } = new DecisionCostStore().record({
      decisionId: 'decision-0',
      gate: 'consensus_vote',
      voters: [{ role: 'reviewer', model: 'test-model', inputTokens: 1, outputTokens: 1 }],
      billingMode: 'plan',
      timestamp: new Date().toISOString(),
    });
    const validLines = Array.from({ length: 5001 }, (_, i) =>
      JSON.stringify({ ...record, decisionId: `decision-${String(i)}` })
    );
    const corruptDuplicate = JSON.stringify({ ...record, summary: 'corrupt' });
    writeFileSync(path, `${[...validLines, corruptDuplicate].join('\n')}\n`);

    expect(() => resolveWeatherDecisionCosts(0)).toThrow(/invalid.*decision cost/i);
    expect(() => resolveWeatherDecisionCosts(0)).toThrow(/invalid.*decision cost/i);
  });
});
