/**
 * Tests for the tool-fitness ledger data layer (#3851).
 *
 * Covers record → aggregate → query, round-trip persistence, bounded
 * retention, and the edge cases called out in the issue (unknown tool,
 * empty ledger).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  ToolFitnessLedger,
  ToolFitnessEventSchema,
  getToolFitnessLedger,
  _resetToolFitnessLedgerForTests,
  type ToolFitnessEvent,
} from './tool-fitness-ledger.js';

let tmpDir: string;
let filePath: string;

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `nexus-tool-fitness-${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tmpDir, { recursive: true });
  filePath = join(tmpDir, 'ledger.jsonl');
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  _resetToolFitnessLedgerForTests();
});

describe('ToolFitnessEventSchema', () => {
  it('accepts a well-formed event', () => {
    const ev: ToolFitnessEvent = {
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: 'memory_query',
      success: true,
      cost: 42,
    };
    expect(ToolFitnessEventSchema.safeParse(ev).success).toBe(true);
  });

  it('rejects an empty tool name', () => {
    const parsed = ToolFitnessEventSchema.safeParse({
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: '',
      success: true,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a negative cost', () => {
    const parsed = ToolFitnessEventSchema.safeParse({
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: 'x',
      success: true,
      cost: -1,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('ToolFitnessLedger — record → aggregate → query', () => {
  it('records invocations and counts them per tool', () => {
    const ledger = new ToolFitnessLedger({ filePath });
    ledger.record({ tool: 'memory_query', success: true });
    ledger.record({ tool: 'memory_query', success: false });
    ledger.record({ tool: 'orchestrate', success: true });

    expect(ledger.size()).toBe(3);

    const mq = ledger.statFor('memory_query');
    expect(mq).toBeDefined();
    expect(mq?.invocationCount).toBe(2);
    expect(mq?.successCount).toBe(1);
    expect(mq?.failureCount).toBe(1);
    expect(mq?.successRate).toBe(0.5);
  });

  it('tracks lastUsedAt as the most recent timestamp regardless of insert order', () => {
    const ledger = new ToolFitnessLedger({ filePath });
    ledger.record({ tool: 'run', success: true, ts: '2026-06-10T00:00:00.000Z' });
    ledger.record({ tool: 'run', success: true, ts: '2026-06-15T00:00:00.000Z' });
    ledger.record({ tool: 'run', success: true, ts: '2026-06-12T00:00:00.000Z' });

    expect(ledger.statFor('run')?.lastUsedAt).toBe('2026-06-15T00:00:00.000Z');
  });

  it('sums cost only over events that reported one (undefined = unmeasured)', () => {
    const ledger = new ToolFitnessLedger({ filePath });
    // No cost reported anywhere → totalCost stays undefined (unmeasured).
    ledger.record({ tool: 'no_cost', success: true });
    expect(ledger.statFor('no_cost')?.totalCost).toBeUndefined();

    // Mixed: only measured events contribute.
    ledger.record({ tool: 'has_cost', success: true, cost: 10 });
    ledger.record({ tool: 'has_cost', success: false });
    ledger.record({ tool: 'has_cost', success: true, cost: 5 });
    expect(ledger.statFor('has_cost')?.totalCost).toBe(15);
  });

  it('report() returns every tool sorted by descending invocation count', () => {
    const ledger = new ToolFitnessLedger({ filePath });
    ledger.record({ tool: 'rare', success: true });
    ledger.record({ tool: 'busy', success: true });
    ledger.record({ tool: 'busy', success: true });
    ledger.record({ tool: 'busy', success: false });
    ledger.record({ tool: 'mid', success: true });
    ledger.record({ tool: 'mid', success: true });

    const report = ledger.report();
    expect(report.map((s) => s.tool)).toEqual(['busy', 'mid', 'rare']);
    expect(report.map((s) => s.invocationCount)).toEqual([3, 2, 1]);
  });

  it('report() breaks invocation-count ties by tool name', () => {
    const ledger = new ToolFitnessLedger({ filePath });
    ledger.record({ tool: 'zebra', success: true });
    ledger.record({ tool: 'alpha', success: true });
    expect(ledger.report().map((s) => s.tool)).toEqual(['alpha', 'zebra']);
  });
});

describe('ToolFitnessLedger — edge cases', () => {
  it('statFor() returns undefined for an unknown tool', () => {
    const ledger = new ToolFitnessLedger({ filePath });
    ledger.record({ tool: 'known', success: true });
    expect(ledger.statFor('never_seen')).toBeUndefined();
  });

  it('statFor() returns undefined on an empty ledger', () => {
    const ledger = new ToolFitnessLedger({ filePath });
    expect(ledger.statFor('anything')).toBeUndefined();
  });

  it('report() returns an empty array on an empty ledger', () => {
    const ledger = new ToolFitnessLedger({ filePath });
    expect(ledger.report()).toEqual([]);
    expect(ledger.size()).toBe(0);
  });
});

describe('ToolFitnessLedger — persistence', () => {
  it('round-trips through save → reload', () => {
    const first = new ToolFitnessLedger({ filePath });
    first.record({ tool: 'pipeline', success: true, cost: 3 });
    first.record({ tool: 'pipeline', success: false });

    const reloaded = new ToolFitnessLedger({ filePath });
    expect(reloaded.size()).toBe(2);
    const stat = reloaded.statFor('pipeline');
    expect(stat?.invocationCount).toBe(2);
    expect(stat?.successCount).toBe(1);
    expect(stat?.totalCost).toBe(3);
  });

  it('writes one JSONL line per recorded event', () => {
    const ledger = new ToolFitnessLedger({ filePath });
    ledger.record({ tool: 'a', success: true });
    ledger.record({ tool: 'b', success: false });

    const lines = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]!) as ToolFitnessEvent;
    expect(parsed.v).toBe(1);
    expect(parsed.tool).toBe('a');
  });

  it('skips corrupt lines on hydrate without throwing', () => {
    const good: ToolFitnessEvent = {
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: 'survivor',
      success: true,
    };
    writeFileSync(filePath, `${JSON.stringify(good)}\nnot-json\n{"v":1}\n`);

    const ledger = new ToolFitnessLedger({ filePath });
    expect(ledger.size()).toBe(1);
    expect(ledger.statFor('survivor')?.invocationCount).toBe(1);
  });

  it('bounds retention to maxEvents (oldest evicted)', () => {
    const ledger = new ToolFitnessLedger({ filePath, maxEvents: 3 });
    for (let i = 0; i < 5; i++) ledger.record({ tool: `t${String(i)}`, success: true });

    expect(ledger.size()).toBe(3);
    // Oldest two (t0, t1) evicted; newest three retained.
    expect(ledger.statFor('t0')).toBeUndefined();
    expect(ledger.statFor('t1')).toBeUndefined();
    expect(ledger.statFor('t4')).toBeDefined();

    const onDisk = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    expect(onDisk).toHaveLength(3);
  });
});

describe('getToolFitnessLedger — singleton', () => {
  beforeEach(() => {
    // Route the default-path ledger into the isolated temp dir so the
    // singleton never touches the operator's real ~/.nexus-agents.
    process.env['NEXUS_DATA_DIR'] = tmpDir;
  });

  afterEach(() => {
    delete process.env['NEXUS_DATA_DIR'];
  });

  it('returns the same instance until reset', () => {
    const a = getToolFitnessLedger();
    const b = getToolFitnessLedger();
    expect(a).toBe(b);
    _resetToolFitnessLedgerForTests();
    const c = getToolFitnessLedger();
    expect(c).not.toBe(a);
  });
});
