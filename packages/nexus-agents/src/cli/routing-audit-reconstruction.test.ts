import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import {
  OutcomeStore,
  setOutcomeStore,
  resetOutcomeStore,
} from '../orchestration/outcomes/outcome-store.js';
import { CompositeRouter } from '../cli-adapters/composite-router.js';
import type { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import type { CliName, ICliAdapter } from '../cli-adapters/types.js';
import { auditRouting, computeBanditStats } from './routing-audit-logic.js';
import { formatAsciiOutput, formatJsonOutput } from './routing-audit-format.js';

const NOW = '2026-10-04T12:00:00.000Z';
const CLIS: readonly CliName[] = ['claude', 'gemini', 'codex', 'opencode'];

describe('routing-audit shared reconstruction (#5275)', () => {
  let fixture: string;
  let store: OutcomeStore;
  beforeEach(() => {
    fixture = mkdtempOutsideRepo('nexus-5275-audit-');
    vi.stubEnv('NEXUS_DATA_DIR', join(fixture, 'data'));
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    store = new OutcomeStore();
    setOutcomeStore(store);
  });
  afterEach(() => {
    resetOutcomeStore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(fixture, { recursive: true, force: true });
  });

  it('equals the router bandit for the same store, arms and alpha', () => {
    store.append({
      id: 'real',
      cli: 'claude',
      model: 'claude-default',
      category: 'code_generation',
      success: true,
      durationMs: 100,
      timestamp: NOW,
      source: 'manual',
    });
    const adapters = new Map(
      CLIS.map((name) => [name, { name, transport: 'subprocess' } as ICliAdapter])
    );
    const router = new CompositeRouter(adapters, {
      enableBudgetFilter: false,
      enableZeroRouter: false,
      enableTopsisRanking: false,
      enableLinUCBSelection: true,
      linucbAlpha: 1,
      enableRoutingMemory: false,
      enableCapacityBalancing: false,
      enableStrategyDistillation: false,
    });
    const audit = auditRouting({ task: 'Implement a parser', banditStats: true });
    const routerBandit = (router as unknown as { linucbBandit: LinUCBBandit }).linucbBandit;
    expect(audit.banditStats).toEqual(computeBanditStats(routerBandit));
    expect(
      audit.linucbDetails.map(({ cliName, pullCount, avgReward }) => ({
        name: cliName,
        pullCount,
        avgReward,
      }))
    ).toEqual(router.getStats().banditStats);
    expect(
      audit.banditStats?.detailedArms.find((arm) => arm.cliName === 'claude')?.pullCount
    ).toBeGreaterThan(0);
  });

  it('labels reconstruction time, replay count, window and live-state limitation', () => {
    store.append({
      id: 'real',
      cli: 'claude',
      model: 'claude-default',
      category: 'code_generation',
      success: true,
      durationMs: 100,
      timestamp: NOW,
      source: 'manual',
    });
    const result = auditRouting({ task: 'Implement a parser' });
    const output = formatAsciiOutput(result, { task: result.task });
    expect(output).toContain('reconstructed from the outcome store at');
    expect(output).toContain(NOW);
    expect(output).toContain('1 outcomes replayed, window 30d');
    expect(output).toContain("not the live router's in-memory state; see #7057");
    expect(output).not.toContain('cold bandit');
    expect(JSON.parse(formatJsonOutput(result))).toHaveProperty(
      'banditReconstruction.reconstructedAt',
      NOW
    );
    expect(JSON.parse(formatJsonOutput(result))).toHaveProperty(
      'banditReconstruction.outcomesReplayed',
      1
    );
    expect(formatJsonOutput(result)).toContain('1 outcomes replayed, window 30d');
  });

  it('explicitly reports zero recent outcomes and synthetic fallback for an empty store', () => {
    const result = auditRouting({ task: 'Implement a parser' });
    const output = formatAsciiOutput(result, { task: result.task });
    expect(output).toContain('0 outcomes replayed, window 30d');
    expect(output).toContain('no empirical outcomes replayed');
    expect(output).toContain('fallback replay');
  });

  it('reconstructs the fallback in memory without writing to the outcome store', () => {
    const result = auditRouting({ task: 'Implement a parser' });
    expect(store.size).toBe(0);
    expect(result.banditReconstruction?.fallbackUsed).toBe(true);
    expect(result.banditReconstruction?.fallbackOutcomesReplayed).toBeGreaterThan(0);
    expect(formatAsciiOutput(result, { task: result.task })).toContain('0 empirical');
  });
});
