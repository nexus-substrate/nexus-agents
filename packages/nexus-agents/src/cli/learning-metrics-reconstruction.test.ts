/** Learning metrics must disclose its reconstructed, rather than live, bandit (#5275). */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedTimeProvider, resetTimeProvider, setTimeProvider } from '../core/time-provider.js';
import { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import { getOutcomeStore, resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { learningMetricsCommand, runLearningMetrics } from './learning-metrics-command.js';
import { BOX_WIDTH } from './box-drawing.js';
import { visibleWidth } from './ansi-width.js';

const NOW = '2026-10-04T12:00:00.000Z';
const OPTIONS = { period: 24, format: 'ascii' as const, banditStats: true, showTrends: false };

describe('learning metrics reconstruction (#5275)', () => {
  let fixtureRoot: string;
  let stdout: string;

  beforeEach(() => {
    fixtureRoot = mkdtempOutsideRepo('learning-metrics-5275-');
    vi.stubEnv('NEXUS_DATA_DIR', join(fixtureRoot, 'data'));
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    resetOutcomeStore();
    setTimeProvider(new FixedTimeProvider(new Date(NOW)));
    stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    resetOutcomeStore();
    resetTimeProvider();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it.each([1, 248])('labels reconstruction from %i empirical outcomes', (count) => {
    for (let index = 0; index < count; index++) {
      getOutcomeStore().append({
        id: `measured-routing-${String(index)}`,
        cli: 'claude',
        model: 'claude-default',
        category: 'code_generation',
        success: true,
        durationMs: 100,
        timestamp: NOW,
        source: 'delegate',
      });
    }
    const result = runLearningMetrics();
    expect(result).toHaveProperty('banditReconstruction.reconstructedAt', NOW);
    expect(result).toHaveProperty('banditReconstruction.outcomesReplayed', count);
    expect(result).toHaveProperty('banditReconstruction.empiricalOutcomesReplayed', count);
    expect(result.models.find((model) => model.name === 'claude')?.pullCount).toBeGreaterThan(0);
    // Empirical replay measures reconstructed learning, not live exploration (#7160).
    expect(result.summary.learningStatus).toBe('reconstructed');
    expect(learningMetricsCommand(OPTIONS)).toBe(0);
    expect(stdout).toContain(`${String(count)} outcomes replayed`);
    expect(stdout).toContain(
      `Learning Status: reconstructed (${String(count)} empirical outcomes)`
    );
    expect(stdout).not.toContain('unmeasured (no empirical replay)');
    expect(stdout).toMatch(/Exploration Ratio:.*\(unmeasured\)/);
    expect(stdout).not.toMatch(/\((healthy|adjust)\)/);
    const statusLine = stdout.split('\n').find((line) => line.includes('Learning Status:'));
    expect(visibleWidth(statusLine ?? '')).toBeLessThanOrEqual(BOX_WIDTH);
    stdout = '';
    expect(learningMetricsCommand({ ...OPTIONS, format: 'json' })).toBe(0);
    const parsed = JSON.parse(stdout) as { summary: { learningStatus: string } };
    expect(parsed.summary.learningStatus).toBe('reconstructed');
  });

  it('labels ASCII with the reconstruction time, replay count and live-state limitation', () => {
    expect(learningMetricsCommand(OPTIONS)).toBe(0);
    expect(stdout.replace(/\s+/g, ' ')).toContain(`reconstructed from the outcome store at ${NOW}`);
    expect(stdout).toContain('0 outcomes replayed');
    expect(stdout).toContain('window 30d');
    expect(stdout).toContain("not the live router's in-memory state; see #7057");
    expect(stdout).toContain('unmeasured (no empirical replay)');
    expect(stdout).not.toContain('(healthy)');
  });

  it('does not write synthetic warm-up rows to the outcome store', () => {
    expect(getOutcomeStore().size).toBe(0);
    runLearningMetrics();
    expect(getOutcomeStore().size).toBe(0);
  });

  it('includes reconstruction provenance in JSON for an empty outcome store', () => {
    expect(learningMetricsCommand({ ...OPTIONS, format: 'json' })).toBe(0);
    const parsed = JSON.parse(stdout) as { summary: { learningStatus: string } };
    expect(parsed).toHaveProperty('banditReconstruction.reconstructedAt', NOW);
    expect(parsed).toHaveProperty('banditReconstruction.outcomesReplayed', 0);
    expect(stdout).toContain('0 outcomes replayed');
    expect(stdout).toContain("not the live router's in-memory state; see #7057");
    expect(parsed.summary.learningStatus).toBe('unmeasured');
  });

  it('keeps the empty reconstructed learning status inside the dashboard box', () => {
    expect(learningMetricsCommand(OPTIONS)).toBe(0);
    const statusLine = stdout.split('\n').find((line) => line.includes('Learning Status:'));
    expect(statusLine).toBeDefined();
    expect(visibleWidth(statusLine ?? '')).toBeLessThanOrEqual(BOX_WIDTH);
  });

  it('preserves an injected bandit without claiming it was reconstructed', () => {
    const bandit = new LinUCBBandit(['claude']);
    const result = runLearningMetrics({ bandit });
    expect(result.banditProgress.totalPulls).toBe(0);
    expect(result).not.toHaveProperty('banditReconstruction');
    expect(getOutcomeStore().query()).toHaveLength(0);
  });

  it('does not present recent synthetic warm-up rows as empirical learning evidence', () => {
    getOutcomeStore().append({
      id: 'synthetic-prior',
      cli: 'claude',
      model: 'claude-default',
      category: 'code_generation',
      success: true,
      durationMs: 0,
      timestamp: NOW,
      source: 'manual',
      qualitySignals: ['synthetic:warm-up'],
    });
    const result = runLearningMetrics();
    expect(result).toHaveProperty('banditReconstruction.outcomesReplayed', 1);
    expect(result).toHaveProperty('banditReconstruction.empiricalOutcomesReplayed', 0);
    expect(result.banditProgress.totalPulls).toBeGreaterThan(0);
    expect(result.summary.learningStatus).toBe('unmeasured');
    expect(result.banditProgress.topFeatures).toEqual([]);
    expect(learningMetricsCommand(OPTIONS)).toBe(0);
    expect(stdout).toContain('unmeasured (no empirical replay)');
  });

  it('marks a failed reconstruction unmeasured even after replaying empirical outcomes', () => {
    getOutcomeStore().append({
      id: 'partial-replay',
      cli: 'claude',
      model: 'claude-default',
      category: 'code_generation',
      success: true,
      durationMs: 100,
      timestamp: NOW,
      source: 'delegate',
    });
    vi.spyOn(LinUCBBandit.prototype, 'seedPriors').mockImplementation(() => {
      throw new Error('fixture prior seeding failed');
    });
    const result = runLearningMetrics();
    expect(result).toHaveProperty('banditReconstruction.status', 'failed');
    expect(result).toHaveProperty('banditReconstruction.empiricalOutcomesReplayed', 1);
    expect(result.summary.learningStatus).toBe('unmeasured');
    expect(result.banditProgress.topFeatures).toEqual([]);
    expect(learningMetricsCommand(OPTIONS)).toBe(0);
    expect(stdout).toContain('unmeasured (reconstruction failed)');
    expect(stdout).not.toContain('unmeasured (no empirical replay)');
  });
});
