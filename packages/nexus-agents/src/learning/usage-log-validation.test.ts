/**
 * The usage ledger validates what it reads back (#5328 item 1).
 *
 * `parseFileLines` did `JSON.parse(line) as UsageEvent` — a cast, not a
 * validation — and no `UsageEventSchema` existed. Every sibling JSONL reader in
 * this repo validates: `audit-storage-queries.ts` (`AuditEventSchema.safeParse`),
 * `outcome-store-persistence.ts` (`TaskOutcomeSchema`), `meta-shadow-selector.ts`
 * (`PersistedMetaOutcomeSchema`), `ci-health-log.ts`. This was the one that did
 * not, and it is the cost ledger.
 *
 * `eventMatches` only reads `timestamp` / `modelId` / `category`, so a bad
 * `usdCost` passed straight into `rollupByModel`:
 *
 *   group.reduce((s, e) => s + e.usdCost, 0)
 *
 * A string `usdCost` string-concatenates; a missing one yields `NaN`. Neither
 * throws, so `nexus-agents usage` reported `NaN` or `"0" + "1.5"` spend, and
 * the cost-descending sort silently reordered because NaN comparisons are false.
 *
 * The constraint that shapes the fix: the ledger has LEGACY lines. `priced` and
 * `priceSource` are documented as "Absent on lines written before this field
 * existed", so a schema strict about them would silently discard real history —
 * worse than the bug. The legacy test below is the one that keeps that honest.
 *
 * @module learning/usage-log-validation.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadUsageEvents, rollupByModel } from './usage-log.js';

let dir: string;
let previousDataDir: string | undefined;

/** A well-formed current-schema line. */
function goodLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    modelId: 'claude-sonnet',
    providerId: 'anthropic',
    inputTokens: 100,
    outputTokens: 50,
    usdCost: 1.5,
    latencyMs: 900,
    success: true,
    priced: true,
    ...overrides,
  });
}

function writeLog(...lines: string[]): void {
  const usage = join(dir, 'usage');
  mkdirSync(usage, { recursive: true });
  const now = new Date();
  const name = `usage-${String(now.getUTCFullYear())}-${String(now.getUTCMonth() + 1).padStart(2, '0')}.jsonl`;
  writeFileSync(join(usage, name), lines.join('\n') + '\n');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'usage-log-'));
  previousDataDir = process.env['NEXUS_DATA_DIR'];
  process.env['NEXUS_DATA_DIR'] = dir;
});

afterEach(() => {
  if (previousDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
  else process.env['NEXUS_DATA_DIR'] = previousDataDir;
  rmSync(dir, { recursive: true, force: true });
});

describe('usage ledger validation (#5328)', () => {
  it('loads a well-formed line', () => {
    writeLog(goodLine());
    expect(loadUsageEvents()).toHaveLength(1);
  });

  it('ACCEPTS a legacy line missing priced/priceSource/category', () => {
    // The control that matters most. These fields postdate the original
    // format, and a schema that required them would silently discard every
    // line written before they existed — throwing away real spend history to
    // fix a corruption bug.
    writeLog(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        modelId: 'claude-opus',
        providerId: 'anthropic',
        inputTokens: 10,
        outputTokens: 5,
        usdCost: 0.25,
        latencyMs: 100,
        success: true,
      })
    );
    expect(loadUsageEvents()).toHaveLength(1);
  });

  it('rejects a line whose usdCost is a string', () => {
    writeLog(goodLine({ usdCost: '1.5' }));
    expect(loadUsageEvents()).toHaveLength(0);
  });

  it('rejects a line with no usdCost at all', () => {
    const { usdCost, ...rest } = JSON.parse(goodLine()) as Record<string, unknown>;
    void usdCost;
    writeLog(JSON.stringify(rest));
    expect(loadUsageEvents()).toHaveLength(0);
  });

  it('rejects a line whose success is not a boolean', () => {
    writeLog(goodLine({ success: 'yes' }));
    expect(loadUsageEvents()).toHaveLength(0);
  });

  it('still skips malformed JSON without throwing', () => {
    writeLog('{not json', goodLine());
    expect(loadUsageEvents()).toHaveLength(1);
  });

  it('keeps the rollup finite when a corrupt line sits beside good ones', () => {
    // The observable failure, stated as its own test: this is what a user of
    // `nexus-agents usage` actually saw.
    writeLog(goodLine(), goodLine({ usdCost: 'oops' }), goodLine());
    const rollup = rollupByModel(loadUsageEvents());

    expect(rollup).toHaveLength(1);
    expect(Number.isFinite(rollup[0]!.totalUsdCost)).toBe(true);
    expect(rollup[0]!.totalUsdCost).toBeCloseTo(3.0, 6);
  });
});
