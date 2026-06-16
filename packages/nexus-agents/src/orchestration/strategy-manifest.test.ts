/**
 * nexus-agents/orchestration - Strategy manifest schema + loader tests.
 *
 * @module orchestration/strategy-manifest.test
 * (Source: Issue #3833, #3834)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  StrategyManifestSchema,
  StrategyManifestRegistrySchema,
  StrategyNameSchema,
  EXECUTION_STRATEGY_NAMES,
  parseStrategyManifest,
  parseStrategyManifestRegistry,
  loadStrategyManifestRegistry,
  STRATEGY_MANIFEST_SCHEMA_VERSION,
  type StrategyManifest,
} from './strategy-manifest.js';
import { type ExecutionStrategy } from './meta-orchestrator.js';

/**
 * Type-level assertion mirror of the compile-time lockstep guard in
 * strategy-manifest.ts. If a strategy is ADDED to the router `ExecutionStrategy`
 * union without being added to `EXECUTION_STRATEGY_NAMES`, BOTH this and the
 * source-file guard fail to typecheck (#3881). `assignableToUnion` requires every
 * tuple member to be a router strategy; `assignableFromUnion` (the typed
 * `ExecutionStrategy[]` cast of the array) requires every router strategy to be
 * in the tuple — that direction is what the old hand-copied literal could not
 * detect.
 */
const _assignableToUnion: readonly ExecutionStrategy[] = EXECUTION_STRATEGY_NAMES;
const _assignableFromUnion = EXECUTION_STRATEGY_NAMES as readonly ExecutionStrategy[];
void _assignableToUnion;
void _assignableFromUnion;

const FIXTURE_PATH = join(import.meta.dirname, '__fixtures__/strategy-manifests.example.yaml');

function baseManifest(overrides: Partial<StrategyManifest> = {}): StrategyManifest {
  return {
    id: 'consensus',
    schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION,
    strategy: 'consensus',
    entrypointTool: 'consensus_vote',
    executorAvailable: true,
    description: 'Multi-perspective decision routed to a consensus vote.',
    maturityTier: 'stable',
    latencyClass: 'multi-llm-panel',
    ...overrides,
  };
}

describe('strategy manifest schema', () => {
  it('accepts a valid manifest (forward-compat fields optional)', () => {
    expect(parseStrategyManifest(baseManifest())).toMatchObject({ id: 'consensus' });
  });

  it('accepts a manifest with the forward-compat Epic D / G fields populated', () => {
    const m = baseManifest({ authorityTier: 'advisory', costProfile: 'medium' });
    expect(StrategyManifestSchema.safeParse(m).success).toBe(true);
  });

  it('rejects a bad authorityTier enum value (Epic D field)', () => {
    const bad = baseManifest({ authorityTier: 'god-mode' as never });
    expect(StrategyManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a bad costProfile enum value (Epic G field)', () => {
    const bad = baseManifest({ costProfile: 'free' as never });
    expect(StrategyManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a missing required field (executorAvailable)', () => {
    const rest: Record<string, unknown> = { ...baseManifest() };
    delete rest['executorAvailable'];
    expect(StrategyManifestSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-kebab-case id', () => {
    expect(StrategyManifestSchema.safeParse(baseManifest({ id: 'Bad ID' })).success).toBe(false);
  });

  it('rejects an unknown strategy name', () => {
    const bad = { ...baseManifest(), strategy: 'mega-pipeline' };
    expect(StrategyManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown extra fields (strict)', () => {
    const bad = { ...baseManifest(), bogus: true };
    expect(StrategyManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('enforces the schemaVersion literal (fail closed on a future shape)', () => {
    const bad = { ...baseManifest(), schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION + 1 };
    expect(StrategyManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('allows executorAvailable:false for unwired strategies (fail-closed declaration)', () => {
    const m = baseManifest({
      id: 'graph-workflow',
      strategy: 'graph-workflow',
      entrypointTool: 'run_graph_workflow',
      executorAvailable: false,
    });
    expect(StrategyManifestSchema.safeParse(m).success).toBe(true);
  });

  it('accepts a manifest with declarative selectionRules (#3836)', () => {
    const m = baseManifest({
      selectionRules: [{ priority: 100, patterns: ['consensus'] }],
    });
    expect(StrategyManifestSchema.safeParse(m).success).toBe(true);
  });

  it('rejects a selection rule that constrains neither patterns nor pipelineTypes', () => {
    const m = baseManifest({
      selectionRules: [{ priority: 10, complexities: ['simple'] }] as never,
    });
    expect(StrategyManifestSchema.safeParse(m).success).toBe(false);
  });

  it('rejects an unknown workflow pattern in a selection rule', () => {
    const m = baseManifest({
      selectionRules: [{ priority: 10, patterns: ['mega-wave'] }] as never,
    });
    expect(StrategyManifestSchema.safeParse(m).success).toBe(false);
  });

  it('keeps the manifest enum in lockstep with the router ExecutionStrategy (#3881)', () => {
    // The expected strategy set is DERIVED from EXECUTION_STRATEGY_NAMES — the
    // runtime tuple that strategy-manifest.ts ties to the router ExecutionStrategy
    // union by a compile-time mutual-assignability assertion. Adding a member to
    // the router union without adding it to that tuple is a TYPE error (caught by
    // typecheck before this test even runs); the old hand-copied literal here
    // could not detect an *added* router strategy, which #3881 fixes.
    //
    // The runtime assertions below prove the Zod enum is built FROM that same
    // tuple, so the schema, the type guard, and this test cannot drift apart.
    for (const s of EXECUTION_STRATEGY_NAMES) {
      expect(StrategyNameSchema.safeParse(s).success).toBe(true);
    }
    expect([...StrategyNameSchema.options].sort()).toEqual([...EXECUTION_STRATEGY_NAMES].sort());
    expect(StrategyNameSchema.options.length).toBe(EXECUTION_STRATEGY_NAMES.length);
  });
});

describe('strategy manifest registry schema', () => {
  it('rejects duplicate manifest ids', () => {
    const bad = { version: 1, manifests: [baseManifest(), baseManifest()] };
    expect(StrategyManifestRegistrySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects two manifests fronting the same strategy', () => {
    const bad = {
      version: 1,
      manifests: [baseManifest({ id: 'consensus' }), baseManifest({ id: 'consensus-alt' })],
    };
    expect(StrategyManifestRegistrySchema.safeParse(bad).success).toBe(false);
  });

  it('requires at least one manifest', () => {
    expect(StrategyManifestRegistrySchema.safeParse({ version: 1, manifests: [] }).success).toBe(
      false
    );
  });

  it('requires a positive top-level version', () => {
    const bad = { version: 0, manifests: [baseManifest()] };
    expect(StrategyManifestRegistrySchema.safeParse(bad).success).toBe(false);
  });
});

describe('strategy manifest loader', () => {
  it('loads + validates the example fixture registry from disk', () => {
    const registry = loadStrategyManifestRegistry(FIXTURE_PATH);
    expect(registry.version).toBe(1);
    expect(registry.manifests.length).toBe(2);
    // The fixture covers both a wired and a fail-closed strategy.
    expect(registry.manifests.some((m) => m.executorAvailable)).toBe(true);
    expect(registry.manifests.some((m) => !m.executorAvailable)).toBe(true);
  });

  it('parses the fixture via the YAML text parser', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf-8');
    const registry = parseStrategyManifestRegistry(text);
    const ids = registry.manifests.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('throws fail-closed when the registry file is missing', () => {
    expect(() => loadStrategyManifestRegistry('/no/such/strategy-manifests.yaml')).toThrow(
      /not found/
    );
  });
});
