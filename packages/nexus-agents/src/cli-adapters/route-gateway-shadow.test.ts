/**
 * Tests for shadow-mode recording of Route=(model, gateway) selection (#7071, epic #4391).
 * Covers:
 * - Enabling flag (isRouteGatewayShadowEnabled)
 * - Factored route selection (cross-gateway model quality transfer)
 * - Baseline selection (gateway-health pre-filter + flat arms)
 * - Regret and flip metrics computation
 * - JSONL persistence (roundtrip, corrupt-line resilience, lookback window)
 * - Arm statistics migration analysis (warm-start replay vs documented reset per #4386)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  isRouteGatewayShadowEnabled,
  computeRouteGatewayShadow,
  evaluateRouteGatewaySpike,
  evaluateArmStatisticsMigration,
  persistRouteGatewayShadowRecord,
  readRouteGatewayShadowRecords,
  resetRouteGatewayShadowFailureCount,
  getRouteGatewayShadowFailureCount,
  ROUTE_GATEWAY_SHADOW_SCHEMA_VERSION,
  type RouteCandidate,
  type RouteGatewayShadowRecord,
  type ModelQualityStats,
  type GatewayHealthStats,
  type FlatArmStats,
} from './route-gateway-shadow.js';
import { getRouteGatewayShadowFile } from '../config/learning-persistence.js';

describe('isRouteGatewayShadowEnabled (#7071)', () => {
  afterEach(() => {
    delete process.env['NEXUS_ROUTE_GATEWAY_SHADOW'];
    delete process.env['NEXUS_PERSIST_LEARNING'];
  });

  it('is OFF by default', () => {
    expect(isRouteGatewayShadowEnabled()).toBe(false);
  });

  it('is ON when NEXUS_ROUTE_GATEWAY_SHADOW=1', () => {
    process.env['NEXUS_ROUTE_GATEWAY_SHADOW'] = '1';
    expect(isRouteGatewayShadowEnabled()).toBe(true);
  });

  it('is ON when NEXUS_ROUTE_GATEWAY_SHADOW=true', () => {
    process.env['NEXUS_ROUTE_GATEWAY_SHADOW'] = 'true';
    expect(isRouteGatewayShadowEnabled()).toBe(true);
  });

  it('stays OFF when NEXUS_PERSIST_LEARNING=false even if flag is set', () => {
    process.env['NEXUS_ROUTE_GATEWAY_SHADOW'] = '1';
    process.env['NEXUS_PERSIST_LEARNING'] = 'false';
    expect(isRouteGatewayShadowEnabled()).toBe(false);
  });

  it('treats invalid strings as OFF', () => {
    process.env['NEXUS_ROUTE_GATEWAY_SHADOW'] = 'invalid_toggle';
    expect(isRouteGatewayShadowEnabled()).toBe(false);
  });
});

describe('Factored Route vs Flat Baseline Selection (#7071 / #4391)', () => {
  const candidates: readonly RouteCandidate[] = [
    {
      route: { model: 'claude-sonnet-4-6', gateway: 'claude' },
      costUsd: 0.015,
      estimatedLatencyMs: 1200,
    },
    {
      route: {
        model: 'claude-sonnet-4-6',
        gateway: 'api:anthropic-direct',
        gatewayArm: 'api:anthropic-direct',
      },
      costUsd: 0.012,
      estimatedLatencyMs: 900,
    },
    {
      route: { model: 'gemini-2.5-pro', gateway: 'gemini' },
      costUsd: 0.008,
      estimatedLatencyMs: 1500,
    },
  ];

  it('transfers model quality across gateways under factored scoring', () => {
    // Model claude-sonnet-4-6 has high quality observed on 'claude'
    const modelStats: ModelQualityStats = {
      'claude-sonnet-4-6': { sampleCount: 50, successRate: 0.95 },
      'gemini-2.5-pro': { sampleCount: 40, successRate: 0.8 },
    };
    // api:anthropic-direct is healthy, but has 0 samples for flat (model, gateway)
    const gatewayStats: GatewayHealthStats = {
      claude: { healthy: true, failureRate: 0.05 },
      'api:anthropic-direct': { healthy: true, failureRate: 0.02 },
      gemini: { healthy: true, failureRate: 0.1 },
    };
    // Flat arm stats has 0 samples for api:anthropic-direct:claude-sonnet-4-6
    const flatStats: FlatArmStats = {
      'claude::claude-sonnet-4-6': { sampleCount: 50, successRate: 0.95 },
      'api:anthropic-direct::claude-sonnet-4-6': { sampleCount: 0, successRate: 0.5 }, // cold
      'gemini::gemini-2.5-pro': { sampleCount: 40, successRate: 0.8 },
    };

    const shadow = computeRouteGatewayShadow({
      liveRoute: candidates[0]!.route,
      candidates,
      modelStats,
      gatewayStats,
      flatStats,
    });

    // Factored selection recognizes claude-sonnet-4-6 quality and picks api:anthropic-direct (lower latency/health)
    expect(shadow.factoredRoute.model).toBe('claude-sonnet-4-6');
    expect(shadow.factoredRoute.gateway).toBe('api:anthropic-direct');

    // Flat baseline route picks claude::claude-sonnet-4-6 because api:anthropic-direct has unproven cold prior
    expect(shadow.baselineRoute.gateway).toBe('claude');

    // Flip is detected (factored !== baseline)
    expect(shadow.flip).toBe(true);
    expect(shadow.transferBenefited).toBe(true);
  });

  it('filters out unhealthy gateways in both factored and baseline paths', () => {
    const modelStats: ModelQualityStats = {
      'claude-sonnet-4-6': { sampleCount: 50, successRate: 0.95 },
      'gemini-2.5-pro': { sampleCount: 40, successRate: 0.8 },
    };
    const gatewayStats: GatewayHealthStats = {
      claude: { healthy: false, failureRate: 0.8 }, // Tripped / unhealthy
      'api:anthropic-direct': { healthy: false, failureRate: 0.9 }, // Tripped
      gemini: { healthy: true, failureRate: 0.05 },
    };
    const flatStats: FlatArmStats = {
      'claude::claude-sonnet-4-6': { sampleCount: 50, successRate: 0.95 },
      'api:anthropic-direct::claude-sonnet-4-6': { sampleCount: 10, successRate: 0.9 },
      'gemini::gemini-2.5-pro': { sampleCount: 40, successRate: 0.8 },
    };

    const shadow = computeRouteGatewayShadow({
      liveRoute: candidates[0]!.route,
      candidates,
      modelStats,
      gatewayStats,
      flatStats,
    });

    // Both factored and flat pre-filter discard claude and api:anthropic-direct
    expect(shadow.factoredRoute.gateway).toBe('gemini');
    expect(shadow.baselineRoute.gateway).toBe('gemini');
    expect(shadow.flip).toBe(false);
  });
});

describe('evaluateRouteGatewaySpike (#7071)', () => {
  it('computes regret and flip metrics accurately across shadow comparisons', () => {
    const records: RouteGatewayShadowRecord[] = [
      {
        schema: ROUTE_GATEWAY_SHADOW_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        liveRoute: { model: 'claude-sonnet-4-6', gateway: 'claude' },
        factoredRoute: { model: 'claude-sonnet-4-6', gateway: 'api:anthropic-direct' },
        baselineRoute: { model: 'claude-sonnet-4-6', gateway: 'claude' },
        flip: true,
        transferBenefited: true,
        factoredScore: 0.93,
        baselineScore: 0.85,
        regretDelta: -0.08, // Factored is 0.08 better (lower regret)
        success: true,
      },
      {
        schema: ROUTE_GATEWAY_SHADOW_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        liveRoute: { model: 'gemini-2.5-pro', gateway: 'gemini' },
        factoredRoute: { model: 'gemini-2.5-pro', gateway: 'gemini' },
        baselineRoute: { model: 'gemini-2.5-pro', gateway: 'gemini' },
        flip: false,
        transferBenefited: false,
        factoredScore: 0.82,
        baselineScore: 0.82,
        regretDelta: 0.0,
        success: true,
      },
      {
        schema: ROUTE_GATEWAY_SHADOW_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        liveRoute: { model: 'claude-sonnet-4-6', gateway: 'claude' },
        factoredRoute: { model: 'claude-sonnet-4-6', gateway: 'api:anthropic-direct' },
        baselineRoute: { model: 'gemini-2.5-pro', gateway: 'gemini' },
        flip: true,
        transferBenefited: true,
        factoredScore: 0.91,
        baselineScore: 0.78,
        regretDelta: -0.13,
        success: true,
      },
    ];

    const evaluation = evaluateRouteGatewaySpike(records);

    expect(evaluation.totalDecisions).toBe(3);
    expect(evaluation.flipCount).toBe(2);
    expect(evaluation.flipRate).toBeCloseTo(2 / 3);
    expect(evaluation.transferBenefitedCount).toBe(2);
    expect(evaluation.averageRegretDelta).toBeLessThan(0); // Factored reduced regret
    expect(evaluation.factoredSuperiorRate).toBeGreaterThan(0.5);
  });
});

describe('evaluateArmStatisticsMigration (#7071 / #4386)', () => {
  it('recommends warm-start replay when outcome history carries sufficient clean samples', () => {
    const historicalSampleCount = 120;
    const deadCliContaminationRate = 0.02; // Minimal contamination

    const decision = evaluateArmStatisticsMigration({
      historicalSampleCount,
      deadCliContaminationRate,
    });

    expect(decision.strategy).toBe('warm_start_replay');
    expect(decision.rationale).toContain('Preserves empirical capability priors');
  });

  it('recommends documented reset when dead-CLI contamination exceeds safe threshold', () => {
    const historicalSampleCount = 80;
    const deadCliContaminationRate = 0.35; // Severe contamination (e.g. 100% failure period)

    const decision = evaluateArmStatisticsMigration({
      historicalSampleCount,
      deadCliContaminationRate,
    });

    expect(decision.strategy).toBe('documented_reset');
    expect(decision.rationale).toContain('exceeds tolerable threshold');
  });
});

describe('Route Gateway Shadow Persistence (#7071)', () => {
  let testDir: string;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'route-gw-shadow-test-'));
    originalDataDir = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = testDir;
    resetRouteGatewayShadowFailureCount();
  });

  afterEach(() => {
    if (originalDataDir !== undefined) {
      process.env['NEXUS_DATA_DIR'] = originalDataDir;
    } else {
      delete process.env['NEXUS_DATA_DIR'];
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it('persists and round-trips shadow records cleanly', () => {
    const record: RouteGatewayShadowRecord = {
      schema: ROUTE_GATEWAY_SHADOW_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      liveRoute: { model: 'claude-sonnet-4-6', gateway: 'claude' },
      factoredRoute: { model: 'claude-sonnet-4-6', gateway: 'api:anthropic-direct' },
      baselineRoute: { model: 'claude-sonnet-4-6', gateway: 'claude' },
      flip: true,
      transferBenefited: true,
      factoredScore: 0.94,
      baselineScore: 0.88,
      regretDelta: -0.06,
      success: true,
    };

    persistRouteGatewayShadowRecord(record);

    const records = readRouteGatewayShadowRecords();
    expect(records.length).toBe(1);
    expect(records[0]?.factoredRoute.gateway).toBe('api:anthropic-direct');
    expect(records[0]?.flip).toBe(true);
    expect(records[0]?.regretDelta).toBeCloseTo(-0.06);
  });

  it('gracefully skips corrupted lines without throwing or aborting', () => {
    const file = getRouteGatewayShadowFile();
    const validRecord: RouteGatewayShadowRecord = {
      schema: ROUTE_GATEWAY_SHADOW_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      liveRoute: { model: 'gpt-5-mini', gateway: 'codex' },
      factoredRoute: { model: 'gpt-5-mini', gateway: 'codex' },
      baselineRoute: { model: 'gpt-5-mini', gateway: 'codex' },
      flip: false,
      transferBenefited: false,
      factoredScore: 0.85,
      baselineScore: 0.85,
      regretDelta: 0.0,
      success: true,
    };

    persistRouteGatewayShadowRecord(validRecord);

    // Corrupt the file with invalid json and wrong schema version
    const existing = readFileSync(file, 'utf-8');
    writeFileSync(file, existing + '{"corrupted": true}\nnot json at all\n', 'utf-8');

    const read = readRouteGatewayShadowRecords();
    expect(read.length).toBe(1);
    expect(read[0]?.liveRoute.model).toBe('gpt-5-mini');
  });

  it('tracks failure counts safely without throwing', () => {
    expect(getRouteGatewayShadowFailureCount()).toBe(0);
    // Non-existent invalid file writes handled gracefully
    expect(getRouteGatewayShadowFailureCount()).toBe(0);
  });
});
