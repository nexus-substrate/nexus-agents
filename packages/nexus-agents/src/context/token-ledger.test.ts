/**
 * Tests for the per-call token ledger (#4252, Phase 0 of epic #4251).
 *
 * Mirrors the tool-fitness-ledger test shape (#3851): schema validation,
 * record → aggregate → query, bounded retention, persistence round-trip, and
 * the singleton contract. New here: aggregation is by contextSource TAG and by
 * tool, plus an optional time window — the query surface #4252 asks for.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  TokenLedger,
  TokenLedgerEventSchema,
  getTokenLedger,
  _resetTokenLedgerForTests,
  CONTEXT_SOURCE_TAGS,
  type TokenLedgerEvent,
} from './token-ledger.js';

let tmpDir: string;
let filePath: string;

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `nexus-token-ledger-${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tmpDir, { recursive: true });
  filePath = join(tmpDir, 'ledger.jsonl');
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  _resetTokenLedgerForTests();
});

describe('TokenLedgerEventSchema', () => {
  it('accepts a well-formed event', () => {
    const ev: TokenLedgerEvent = {
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: 'context-retriever.summarizeContextForPrompt',
      contextSource: 'memory-backend',
      inputTokens: 120,
      outputTokens: 0,
    };
    expect(TokenLedgerEventSchema.safeParse(ev).success).toBe(true);
  });

  it('rejects an empty tool name', () => {
    const parsed = TokenLedgerEventSchema.safeParse({
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: '',
      contextSource: 'raw',
      inputTokens: 1,
      outputTokens: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a negative token count', () => {
    const parsed = TokenLedgerEventSchema.safeParse({
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: 'x',
      contextSource: 'raw',
      inputTokens: -1,
      outputTokens: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts optional model/taskId/variant dimensions', () => {
    const parsed = TokenLedgerEventSchema.safeParse({
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: 'orchestrate',
      contextSource: 'research-synthesis',
      inputTokens: 500,
      outputTokens: 50,
      model: 'claude-sonnet-5',
      taskId: 'task-1',
      variant: 'ranked',
    });
    expect(parsed.success).toBe(true);
  });

  it('does not restrict contextSource to a fixed enum (forward-compat for future tags)', () => {
    // A future phase (e.g. #4254 repo-map) may introduce a new tag; the ledger
    // schema must not require a migration to accept it.
    const parsed = TokenLedgerEventSchema.safeParse({
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: 'x',
      contextSource: 'a-brand-new-tag-from-a-later-phase',
      inputTokens: 1,
      outputTokens: 0,
    });
    expect(parsed.success).toBe(true);
  });

  it('exports the documented known-tag vocabulary', () => {
    expect(CONTEXT_SOURCE_TAGS).toContain('memory-backend');
    expect(CONTEXT_SOURCE_TAGS).toContain('research-synthesis');
    expect(CONTEXT_SOURCE_TAGS).toContain('repo-map');
    expect(CONTEXT_SOURCE_TAGS).toContain('raw');
    expect(CONTEXT_SOURCE_TAGS).toContain('tool-output');
    expect(CONTEXT_SOURCE_TAGS).toContain('system');
  });
});

describe('TokenLedger — record → aggregate → query', () => {
  it('records calls and counts them', () => {
    const ledger = new TokenLedger({ filePath });
    ledger.record({ tool: 'a', contextSource: 'memory-backend', inputTokens: 100 });
    ledger.record({ tool: 'a', contextSource: 'raw', inputTokens: 50, outputTokens: 10 });
    ledger.record({ tool: 'b', contextSource: 'memory-backend', inputTokens: 30 });

    expect(ledger.size()).toBe(3);
  });

  it('defaults outputTokens to 0 when omitted', () => {
    const ledger = new TokenLedger({ filePath });
    ledger.record({ tool: 'a', contextSource: 'raw', inputTokens: 42 });
    expect(ledger.all()[0]?.outputTokens).toBe(0);
  });

  it('summarize() aggregates totals by contextSource tag and by tool', () => {
    const ledger = new TokenLedger({ filePath });
    ledger.record({ tool: 'context-retriever', contextSource: 'memory-backend', inputTokens: 100 });
    ledger.record({
      tool: 'context-retriever',
      contextSource: 'memory-backend',
      inputTokens: 200,
      outputTokens: 5,
    });
    ledger.record({ tool: 'orchestrate', contextSource: 'research-synthesis', inputTokens: 40 });

    const summary = ledger.summarize();
    expect(summary.overall).toEqual({
      entries: 3,
      inputTokens: 340,
      outputTokens: 5,
      totalTokens: 345,
    });
    expect(summary.bySource['memory-backend']).toEqual({
      entries: 2,
      inputTokens: 300,
      outputTokens: 5,
      totalTokens: 305,
    });
    expect(summary.bySource['research-synthesis']).toEqual({
      entries: 1,
      inputTokens: 40,
      outputTokens: 0,
      totalTokens: 40,
    });
    expect(summary.byTool['context-retriever']).toEqual({
      entries: 2,
      inputTokens: 300,
      outputTokens: 5,
      totalTokens: 305,
    });
    expect(summary.byTool['orchestrate']).toEqual({
      entries: 1,
      inputTokens: 40,
      outputTokens: 0,
      totalTokens: 40,
    });
  });

  it('summarize() restricts to a time window when sinceMs/untilMs are given', () => {
    const ledger = new TokenLedger({ filePath });
    ledger.record({
      tool: 'a',
      contextSource: 'raw',
      inputTokens: 10,
      ts: '2026-01-01T00:00:00.000Z',
    });
    ledger.record({
      tool: 'a',
      contextSource: 'raw',
      inputTokens: 20,
      ts: '2026-06-01T00:00:00.000Z',
    });
    ledger.record({
      tool: 'a',
      contextSource: 'raw',
      inputTokens: 30,
      ts: '2026-12-01T00:00:00.000Z',
    });

    const midYear = Date.parse('2026-06-01T00:00:00.000Z');
    const before = ledger.summarize({ untilMs: midYear });
    expect(before.overall.entries).toBe(1);
    expect(before.overall.inputTokens).toBe(10);

    const fromMidYear = ledger.summarize({ sinceMs: midYear });
    expect(fromMidYear.overall.entries).toBe(2);
    expect(fromMidYear.overall.inputTokens).toBe(50);
  });

  it('summarize() on an empty ledger returns zeroed aggregates', () => {
    const ledger = new TokenLedger({ filePath });
    const summary = ledger.summarize();
    expect(summary.overall).toEqual({
      entries: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    expect(summary.bySource).toEqual({});
    expect(summary.byTool).toEqual({});
  });
});

describe('TokenLedger — persistence', () => {
  it('round-trips through save → reload', () => {
    const first = new TokenLedger({ filePath });
    first.record({ tool: 'a', contextSource: 'memory-backend', inputTokens: 10, outputTokens: 2 });
    first.record({ tool: 'b', contextSource: 'raw', inputTokens: 5 });

    const reloaded = new TokenLedger({ filePath });
    expect(reloaded.size()).toBe(2);
    expect(reloaded.summarize().overall.entries).toBe(2);
  });

  it('writes one JSONL line per recorded call', () => {
    const ledger = new TokenLedger({ filePath });
    ledger.record({ tool: 'a', contextSource: 'raw', inputTokens: 1 });
    ledger.record({ tool: 'b', contextSource: 'raw', inputTokens: 2 });

    const lines = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]!) as TokenLedgerEvent;
    expect(parsed.v).toBe(1);
    expect(parsed.tool).toBe('a');
  });

  it('skips corrupt lines on hydrate without throwing', () => {
    const good: TokenLedgerEvent = {
      v: 1,
      ts: '2026-06-15T10:00:00.000Z',
      tool: 'survivor',
      contextSource: 'raw',
      inputTokens: 1,
      outputTokens: 0,
    };
    writeFileSync(filePath, `${JSON.stringify(good)}\nnot-json\n{"v":1}\n`);

    const ledger = new TokenLedger({ filePath });
    expect(ledger.size()).toBe(1);
  });

  it('bounds retention to maxEvents (oldest evicted)', () => {
    const ledger = new TokenLedger({ filePath, maxEvents: 3 });
    for (let i = 0; i < 5; i++) {
      ledger.record({ tool: `t${String(i)}`, contextSource: 'raw', inputTokens: i });
    }

    expect(ledger.size()).toBe(3);
    const onDisk = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    expect(onDisk).toHaveLength(3);
  });
});

describe('getTokenLedger — singleton', () => {
  beforeEach(() => {
    process.env['NEXUS_DATA_DIR'] = tmpDir;
  });

  afterEach(() => {
    delete process.env['NEXUS_DATA_DIR'];
  });

  it('returns the same instance until reset', () => {
    const a = getTokenLedger();
    const b = getTokenLedger();
    expect(a).toBe(b);
    _resetTokenLedgerForTests();
    const c = getTokenLedger();
    expect(c).not.toBe(a);
  });
});
