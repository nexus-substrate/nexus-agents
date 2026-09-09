/**
 * Tests for Health Command
 * @module cli/health-command.test
 * (Source: Issue #1403)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock weather report before import
vi.mock('../mcp/tools/weather-report.js', () => ({
  generateWeatherReport: vi.fn(),
}));

import { collectHealth, handleHealthCommand } from './health-command.js';
import { generateWeatherReport } from '../mcp/tools/weather-report.js';
import type { ParsedCliArgs } from '../cli-types.js';

const mockGenerate = vi.mocked(generateWeatherReport);

const SWARM_HEALTH = {
  agentUtilization: 0.72,
  collaborationEfficiency: 0.45,
  routingAccuracy: 0.74,
  weeklyRegret: 0.08,
  adaptationSpeed: 25,
  adaptationSpeedCategories: 6,
  observedCategories: 6,
  analyzedCategories: 6,
  observedRoles: 4,
} as const;

const ZERO_ADAPTER_STATS = {
  adapterAttemptSuccessRate: 0,
  adapterUnavailableCount: 0,
  adapterUnavailableRate: 0,
} as const;

function makeBaseReport(): Omit<ReturnType<typeof generateWeatherReport>, 'swarmHealth'> {
  return {
    overall: {
      totalTasks: 3405,
      successRate: 0.74,
      avgDurationMs: 4000,
      ...ZERO_ADAPTER_STATS,
    },
    cliWeather: [
      {
        cli: 'claude',
        successRate: 0.71,
        totalTasks: 1200,
        avgDurationMs: 5000,
        byCategory: new Map(),
        ...ZERO_ADAPTER_STATS,
      },
      {
        cli: 'gemini',
        successRate: 0.84,
        totalTasks: 800,
        avgDurationMs: 3000,
        byCategory: new Map(),
        ...ZERO_ADAPTER_STATS,
      },
    ],
    failureBreakdown: [
      { category: 'timeout', count: 50, percentage: 15.2 },
      { category: 'unknown', count: 203, percentage: 61.7 },
    ],
    tierRecommendations: [],
    adaptiveBonuses: [],
    explorationRate: 0.1,
    coldStartThreshold: 3,
    collectedAt: new Date().toISOString(),
  };
}

function makeDefaultReport(): ReturnType<typeof generateWeatherReport> {
  return { ...makeBaseReport(), swarmHealth: SWARM_HEALTH };
}

describe('health-command', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockGenerate.mockReturnValue(makeDefaultReport());
  });

  describe('collectHealth', () => {
    it('returns health result from weather report', () => {
      const result = collectHealth();

      expect(result.overallSuccessRate).toBe(0.74);
      expect(result.totalTasks).toBe(3405);
      expect(result.cliCount).toBe(2);
      expect(result.swarmHealth).toBeDefined();
      expect(result.failureBreakdown).toHaveLength(2);
    });

    it('handles missing swarm health', () => {
      mockGenerate.mockReturnValue(makeBaseReport());

      const result = collectHealth();

      expect(result.swarmHealth).toBeUndefined();
    });

    it('includes swarm metrics values', () => {
      const result = collectHealth();

      expect(result.swarmHealth?.agentUtilization).toBe(0.72);
      expect(result.swarmHealth?.routingAccuracy).toBe(0.74);
      expect(result.swarmHealth?.adaptationSpeed).toBe(25);
    });

    it('includes per-CLI health summaries', () => {
      const result = collectHealth();

      expect(result.cliHealth).toHaveLength(2);
      expect(result.cliHealth[0]?.cli).toBe('claude');
      expect(result.cliHealth[0]?.successRate).toBe(0.71);
      expect(result.cliHealth[1]?.cli).toBe('gemini');
      expect(result.cliHealth[1]?.totalTasks).toBe(800);
    });
  });

  describe('handleHealthCommand', () => {
    it('renders table output by default with per-CLI stats', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const args = { command: 'health', options: {} } as unknown as ParsedCliArgs;

      handleHealthCommand(args);

      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Swarm Health Dashboard');
      expect(output).toContain('74.0%');
      expect(output).toContain('Per-CLI Performance');
      expect(output).toContain('claude');
      expect(output).toContain('gemini');
      writeSpy.mockRestore();
    });

    it('renders JSON when format=json', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const args = {
        command: 'health',
        options: { format: 'json' },
      } as unknown as ParsedCliArgs;

      handleHealthCommand(args);

      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed['overallSuccessRate']).toBe(0.74);
      expect(parsed['totalTasks']).toBe(3405);
      writeSpy.mockRestore();
    });

    it('shows no-data message when swarm health unavailable', () => {
      mockGenerate.mockReturnValue(makeBaseReport());
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const args = { command: 'health', options: {} } as unknown as ParsedCliArgs;

      handleHealthCommand(args);

      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('No swarm metrics available');
      writeSpy.mockRestore();
    });
  });
});

describe('lower-is-better metrics print their absence, not their best score (#6036)', () => {
  // weeklyRegret and adaptationSpeed both target LOW values, so the value they
  // take when nothing was measured (0) renders as the BEST possible result.
  // routingAccuracy and the rest are higher-is-better, so their unmeasured 0
  // reads as unhealthy — the safe direction, deliberately left alone.
  function renderWith(overrides: Record<string, number>): string {
    mockGenerate.mockReturnValue({
      ...makeBaseReport(),
      swarmHealth: { ...SWARM_HEALTH, ...overrides },
    });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    handleHealthCommand({ command: 'health', options: {} } as unknown as ParsedCliArgs);
    const out = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();
    return out;
  }

  it('prints unmeasured for regret when no category could be analysed', () => {
    const out = renderWith({ weeklyRegret: 0, analyzedCategories: 0 });
    expect(out).toContain('Weekly Regret:           unmeasured');
    expect(out).not.toContain('Weekly Regret:           0.000');
  });

  it('prints unmeasured for adaptation speed when no category reached confidence', () => {
    const out = renderWith({ adaptationSpeed: 0, adaptationSpeedCategories: 0 });
    expect(out).toContain('Adaptation Speed:        unmeasured');
    expect(out).not.toContain('Adaptation Speed:        0 tasks');
  });

  it('a MEASURED zero is still shown as a number — the point is not to hide zeros', () => {
    const out = renderWith({ weeklyRegret: 0, analyzedCategories: 6 });
    expect(out).toContain('Weekly Regret:           0.000');
    expect(out).not.toContain('Weekly Regret:           unmeasured');
  });

  it('shows how many observed categories were actually analysed', () => {
    // The gap between the two numbers is what was invisible before.
    const out = renderWith({ observedCategories: 6, analyzedCategories: 2 });
    expect(out).toContain('Observed Categories:     6 (2 analysed)');
  });

  it('prints real values unchanged when everything was measured', () => {
    const out = renderWith({});
    expect(out).toContain('Weekly Regret:           0.080');
    expect(out).toContain('Adaptation Speed:        25 tasks');
  });
});
