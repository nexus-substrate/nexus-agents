/** Manifest-tier pricing provenance through trace, ledger and decision consumers (#4600). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateCost, priceBasisCaveat, priceBasisFor } from './trace-pricing.js';
import { buildInTreeEntries } from '../config/in-tree-entries.js';
import { loadManifestOverlay } from '../config/manifest-overlay.js';
import {
  getDefaultRegistry,
  ModelRegistry,
  peekDefaultRegistry,
  setDefaultRegistry,
} from '../config/model-registry.js';
import { computeCostDetail, priceBasisOf } from '../learning/usage-log.js';
import { votesToCostInputs } from '../mcp/tools/decision-cost-recording.js';
import { DecisionCostStore } from '../observability/decision-cost-store.js';
import { recordCeilingCostOfArm } from '../cli-adapters/budget-arm-cost.js';
import type { AgentVoteResult } from '../cli/vote-types.js';

const MILLION = 1_000_000;
const RATE = { inputPer1M: 0.9, outputPer1M: 2.7 };

describe('manifest overlay price basis (#4600)', () => {
  let dir: string;
  let previous: ModelRegistry | undefined;

  beforeEach(() => {
    previous = peekDefaultRegistry();
    dir = mkdtempSync(join(tmpdir(), 'price-basis-overlay-'));
    const path = join(dir, 'manifest.json');
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        models: [
          {
            id: 'negotiated-gateway-model',
            vendor: 'anthropic',
            family: 'claude-sonnet',
            pricing: RATE,
          },
          { id: 'claude-sonnet', vendor: 'anthropic', family: 'claude-sonnet', pricing: RATE },
          { id: 'claude-fable-5', vendor: 'anthropic', family: 'claude-fable', pricing: RATE },
          {
            id: 'claude-sonnet-4-8',
            vendor: 'anthropic',
            family: 'claude-sonnet',
            version: '4-8',
            pricing: RATE,
          },
          { id: 'claude-opus', vendor: 'anthropic', family: 'claude-opus', contextWindow: 100000 },
          {
            id: 'declared-free-model',
            vendor: 'unknown',
            family: 'local',
            pricing: { inputPer1M: 0, outputPer1M: 0 },
          },
        ],
      })
    );
    const overlay = loadManifestOverlay({ path });
    expect(overlay.status).toBe('loaded');
    expect(overlay.entries).toHaveLength(6);
    setDefaultRegistry(
      new ModelRegistry({ inTreeEntries: buildInTreeEntries(), manifestEntries: overlay.entries })
    );
    vi.stubEnv('NEXUS_MODELS_OVERLAY_PATH', path);
    vi.stubEnv('NEXUS_MODEL_REGISTRY_OVERLAY', join(dir, 'missing-user.json'));
  });

  afterEach(() => {
    setDefaultRegistry(previous);
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    'negotiated-gateway-model',
    'claude-sonnet',
    'sonnet',
    'claude-sonnet-4-6',
    'Negotiated_Gateway_Model',
  ])('reports the overlay rate for %s as declared in trace and usage pricing', (model) => {
    expect(priceBasisFor(model)).toBe('declared');
    expect(calculateCost(model, MILLION, MILLION)).toBeCloseTo(3.6);
    const detail = computeCostDetail(model, MILLION, MILLION);
    // CLI shorthand is a trace-only compatibility path, not a registry alias.
    if (model === 'sonnet') return;
    expect(detail.costUsd).toBeCloseTo(3.6);
    expect(priceBasisOf(detail)).toBe('declared');
  });

  it('honors overlay pricing on the first lazy registry lookup', () => {
    setDefaultRegistry(undefined);
    expect(calculateCost('claude-sonnet', MILLION, MILLION)).toBeCloseTo(3.6);
    expect(priceBasisFor('claude-sonnet')).toBe('declared');
  });

  it('retains manifest provenance through an identity match', () => {
    const model = 'Claude_Sonnet_4.8_hardened';
    const entry = getDefaultRegistry().getEntry(model);
    expect(entry.source).toBe('derived');
    expect(entry.matchedVia).toBe('identity');
    expect(entry.resolvedFrom).toBe('claude-sonnet-4-8');
    expect(calculateCost(model, MILLION, MILLION)).toBeCloseTo(3.6);
    expect(priceBasisFor(model)).toBe('declared');
    expect(priceBasisOf(computeCostDetail(model, MILLION, MILLION))).toBe('declared');
  });

  it('caveats an overlay price as operator-declared', () => {
    const basis = priceBasisFor('negotiated-gateway-model');
    expect(priceBasisCaveat(basis)).toBe(
      'Based on an operator-declared rate, not a verified published price.'
    );
    expect(priceBasisCaveat(basis)).not.toContain('may differ');
    expect(priceBasisCaveat(basis)).not.toContain('NEXUS_GATEWAY_COST');
  });

  it('reports an explicit overlay zero as declared, not unknown', () => {
    expect(calculateCost('declared-free-model', MILLION, MILLION)).toBe(0);
    expect(priceBasisFor('declared-free-model')).toBe('declared');
    expect(priceBasisOf(computeCostDetail('declared-free-model', MILLION, MILLION))).toBe(
      'declared'
    );
  });

  it('keeps an in-tree rate list-derived', () => {
    expect(getDefaultRegistry().getEntry('gemini-pro').source).toBe('in-tree');
    expect(calculateCost('gemini-pro', MILLION, MILLION)).toBeCloseTo(11.25);
    expect(priceBasisFor('gemini-pro')).toBe('list');
    expect(priceBasisOf(computeCostDetail('gemini-pro', MILLION, MILLION))).toBe('list');
  });

  it('does not declare a metadata-only overlay price', () => {
    // Trace's legacy matrix inherits pricing; the registry itself has no rate.
    expect(calculateCost('claude-opus', MILLION, MILLION)).toBe(30);
    expect(priceBasisFor('claude-opus')).toBe('list');
    expect(priceBasisOf(computeCostDetail('claude-opus', MILLION, MILLION))).toBe('unknown');
  });

  it.each(['models-dev', 'generated', 'derived'] as const)(
    'does not declare a %s rate',
    (source) => {
      const entry = {
        ...getDefaultRegistry().getEntry('gemini-pro'),
        id: 'other-override',
        source,
        pricing: RATE,
      };
      setDefaultRegistry(new ModelRegistry({ inTreeEntries: [entry] }));
      expect(priceBasisFor(entry.id)).toBe('list');
      expect(priceBasisOf(computeCostDetail(entry.id, MILLION, MILLION))).toBe('list');
    }
  );

  it('persists declared basis in decision summary and per-voter JSONL', () => {
    const seat: AgentVoteResult = {
      role: 'architect',
      cli: 'anthropic',
      source: 'llm',
      model: 'claude-sonnet',
      servedModel: 'claude-sonnet',
      inputTokens: MILLION,
      outputTokens: MILLION,
      processingTimeMs: 1,
      vote: { decision: 'approve', reasoning: 'fixture', confidence: 1 },
    };
    const voters = votesToCostInputs([seat]);
    expect(voters[0]?.priceBasis).toBe('declared');
    expect(voters[0]?.costUsd).toBeCloseTo(3.6);
    const options = { filePath: join(dir, 'decisions.jsonl'), dataDir: dir };
    const { persisted } = new DecisionCostStore(options).record({
      decisionId: 'overlay-basis',
      timestamp: '2026-10-05T00:00:00.000Z',
      gate: 'consensus_vote',
      billingMode: 'api',
      voters,
    });
    expect(persisted).toBe(true);
    const summary = new DecisionCostStore(options).all()[0]?.summary;
    expect(summary?.priceBasis).toBe('declared');
    expect(summary?.perVoter[0]?.priceBasis).toBe('declared');
  });

  it.each(['claude', 'api:custom-openai'] as const)(
    'reports overlay ceiling pricing for %s as declared',
    (arm) => {
      expect(
        recordCeilingCostOfArm({ arm, adapter: undefined }, MILLION, MILLION, 10, {
          NEXUS_GATEWAY_COST: 'priced',
          NEXUS_CUSTOM_MODEL: 'claude-sonnet',
        })
      ).toEqual({ costUsd: expect.closeTo(3.6), priceBasis: 'declared' });
    }
  );
});
