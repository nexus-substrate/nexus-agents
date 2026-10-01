/** Tagged rows are never spend, including unknown or malformed measurements. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getUsageLogPath, loadUsageEvents, recordUsageEvent } from './usage-log.js';

const logger = vi.hoisted(() => ({ warn: vi.fn(), debug: vi.fn() }));
vi.mock('../core/logger.js', () => ({ createLogger: () => logger }));

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'usage-measurements-'));
  vi.stubEnv('NEXUS_DATA_DIR', dataDir);
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

function seedSpend(): void {
  recordUsageEvent({
    timestamp: new Date().toISOString(),
    modelId: 'billed',
    providerId: 'api',
    inputTokens: 3,
    outputTokens: 2,
    usdCost: 0.1,
    latencyMs: 1,
    success: true,
  });
}

describe('non-billing usage ledger rows (#6851)', () => {
  it.each([
    { kind: 'measurement', event: 'future_event' },
    { kind: 'measurement', event: 'voter_late_settlement', settled: 'invalid' },
    { kind: null },
    { kind: false },
  ])('skips and separately counts any tagged row: $kind / $event', (row) => {
    seedSpend();
    appendFileSync(getUsageLogPath(), JSON.stringify(row) + '\n');
    expect(loadUsageEvents().events).toEqual([
      expect.objectContaining({ modelId: 'billed', usdCost: 0.1 }),
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('Usage ledger measurement rows skipped', {
      filePath: getUsageLogPath(),
      skippedMeasurements: 1,
    });
  });

  it('excludes a tagged row even when it also has every spend field', () => {
    seedSpend();
    const line = {
      timestamp: new Date().toISOString(),
      modelId: 'tagged',
      providerId: 'api',
      inputTokens: 3,
      outputTokens: 2,
      usdCost: 99,
      latencyMs: 1,
      success: true,
      kind: 'future',
    };
    appendFileSync(getUsageLogPath(), JSON.stringify(line) + '\n');
    expect(loadUsageEvents().events).toHaveLength(1);
  });

  it('warns only for unreadable rows alongside skipped measurements', () => {
    seedSpend();
    appendFileSync(
      getUsageLogPath(),
      '{"kind":"measurement","event":"future_event"}\nnot-json\n{}\n'
    );
    expect(loadUsageEvents().events).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'Usage ledger lines rejected as unreadable',
      {
        filePath: getUsageLogPath(),
        rejected: 2,
      }
    );
    expect(logger.debug).toHaveBeenCalledWith('Usage ledger measurement rows skipped', {
      filePath: getUsageLogPath(),
      skippedMeasurements: 1,
    });
  });
});
