/**
 * nexus-agents/orchestration - Strategy manifest registry tests (#3835).
 *
 * Behaviour-parity golden test for the migration of the 8 run-tool strategies
 * onto the manifest registry. The pre-migration source of truth — the hardcoded
 * `STRATEGY_ENTRYPOINT_TOOL` map and the implicit "which strategies have a wired
 * executor" set (the keys of run-tool's `buildDefaultExecutors`) — is SNAPSHOTTED
 * here verbatim, and the manifest-sourced lookups are asserted to match it
 * EXACTLY for all 8 strategies. This proves the migration is a no-op on
 * behaviour. Plus: full strategy coverage, fail-closed on an unregistered
 * strategy, and that the embedded TS registry mirrors governance/*.yaml.
 *
 * @module orchestration/strategy-manifest-registry.test
 * (Source: Issue #3833, #3835)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STRATEGY_MANIFEST_REGISTRY,
  entrypointToolFor,
  executorAvailableFor,
  getStrategyManifest,
  selectStrategyByManifest,
} from './strategy-manifest-registry.js';
import { parseStrategyManifestRegistry, type StrategyManifest } from './strategy-manifest.js';
import type { ExecutionStrategy } from './meta-orchestrator.js';

/**
 * GOLDEN SNAPSHOT — the pre-#3835 hardcoded entrypoint map, copied verbatim from
 * run-tool.ts before it was deleted. The migration must reproduce these values
 * byte-for-byte.
 */
const LEGACY_STRATEGY_ENTRYPOINT_TOOL: Readonly<Record<ExecutionStrategy, string>> = {
  'single-shot': 'delegate_to_model',
  'dev-pipeline': 'run_dev_pipeline',
  pipeline: 'run_pipeline',
  'graph-workflow': 'run_graph_workflow',
  orchestrate: 'orchestrate',
  consensus: 'consensus_vote',
  spec: 'execute_spec',
  research: 'run_pipeline',
};

/**
 * GOLDEN SNAPSHOT — the pre-#3835 executor-availability truth. Inline execution
 * was wired for exactly these 4 strategies (the keys of run-tool's
 * `buildDefaultExecutors`); the other 4 failed closed with `no_executor`. The
 * manifest `executorAvailable` flags must reproduce this set exactly.
 */
const LEGACY_EXECUTOR_AVAILABLE: Readonly<Record<ExecutionStrategy, boolean>> = {
  'single-shot': false,
  'dev-pipeline': true,
  pipeline: true,
  'graph-workflow': false,
  orchestrate: false,
  consensus: true,
  spec: false,
  research: true,
};

const ALL_STRATEGIES = Object.keys(LEGACY_STRATEGY_ENTRYPOINT_TOOL) as ExecutionStrategy[];

describe('strategy manifest registry (#3835)', () => {
  it('registers exactly one manifest per execution strategy (all 8)', () => {
    expect(STRATEGY_MANIFEST_REGISTRY.manifests).toHaveLength(ALL_STRATEGIES.length);
    for (const s of ALL_STRATEGIES) {
      expect(getStrategyManifest(s), `manifest missing for strategy '${s}'`).toBeDefined();
    }
  });

  it("each manifest's id equals its strategy for the initial 8", () => {
    for (const m of STRATEGY_MANIFEST_REGISTRY.manifests) {
      expect(m.id).toBe(m.strategy);
    }
  });
});

describe('behaviour parity: manifest-sourced lookups === legacy STRATEGY_ENTRYPOINT_TOOL', () => {
  it('entrypoint tool matches the legacy map EXACTLY for all 8 strategies', () => {
    for (const s of ALL_STRATEGIES) {
      expect(entrypointToolFor(s), `entrypoint mismatch for '${s}'`).toBe(
        LEGACY_STRATEGY_ENTRYPOINT_TOOL[s]
      );
    }
  });

  it('executorAvailable matches the legacy wired-executor set EXACTLY (4/8 true)', () => {
    for (const s of ALL_STRATEGIES) {
      expect(executorAvailableFor(s), `executorAvailable mismatch for '${s}'`).toBe(
        LEGACY_EXECUTOR_AVAILABLE[s]
      );
    }
    const wired = ALL_STRATEGIES.filter((s) => executorAvailableFor(s));
    expect(wired.sort()).toEqual(['consensus', 'dev-pipeline', 'pipeline', 'research'].sort());
  });
});

describe('fail-closed behaviour', () => {
  it('throws on an unregistered strategy (entrypoint)', () => {
    expect(() => entrypointToolFor('does-not-exist' as ExecutionStrategy)).toThrow(
      /No strategy manifest registered/
    );
  });

  it('throws on an unregistered strategy (executorAvailable)', () => {
    expect(() => executorAvailableFor('does-not-exist' as ExecutionStrategy)).toThrow(
      /No strategy manifest registered/
    );
  });
});

describe('manifest-driven router (#3836)', () => {
  it('reproduces the 8-strategy routing decisions purely from manifest rules', () => {
    // Parity matrix: { pattern, pipelineType, complexity } → strategy. Mirrors the
    // pre-#3836 decideStrategy rules, now asserted to come out of the data matcher.
    const cases: ReadonlyArray<
      [Parameters<typeof selectStrategyByManifest>[0], ExecutionStrategy]
    > = [
      [{ pattern: 'consensus', pipelineType: 'general', complexity: 'moderate' }, 'consensus'],
      // Consensus pattern outranks every pipeline template.
      [{ pattern: 'consensus', pipelineType: 'greenfield', complexity: 'moderate' }, 'consensus'],
      [{ pattern: 'sequential', pipelineType: 'greenfield', complexity: 'moderate' }, 'spec'],
      [{ pattern: 'sequential', pipelineType: 'research', complexity: 'moderate' }, 'research'],
      [{ pattern: 'sequential', pipelineType: 'audit', complexity: 'moderate' }, 'pipeline'],
      [{ pattern: 'sequential', pipelineType: 'audit', complexity: 'simple' }, 'pipeline'],
      // Audit only upgrades the SEQUENTIAL fallback; graph/wave keep their engine.
      [{ pattern: 'graph', pipelineType: 'audit', complexity: 'moderate' }, 'graph-workflow'],
      [{ pattern: 'wave', pipelineType: 'audit', complexity: 'moderate' }, 'orchestrate'],
      [{ pattern: 'graph', pipelineType: 'dev', complexity: 'moderate' }, 'graph-workflow'],
      [{ pattern: 'wave', pipelineType: 'dev', complexity: 'moderate' }, 'orchestrate'],
      [{ pattern: 'aflow', pipelineType: 'dev', complexity: 'complex' }, 'orchestrate'],
      [{ pattern: 'puppeteer', pipelineType: 'dev', complexity: 'moderate' }, 'orchestrate'],
      [{ pattern: 'sequential', pipelineType: 'dev', complexity: 'simple' }, 'single-shot'],
      [{ pattern: 'sequential', pipelineType: 'dev', complexity: 'moderate' }, 'dev-pipeline'],
      [{ pattern: 'sequential', pipelineType: 'dev', complexity: 'expert' }, 'dev-pipeline'],
      [{ pattern: 'sequential', pipelineType: 'general', complexity: 'moderate' }, 'dev-pipeline'],
    ];
    for (const [signals, expected] of cases) {
      const selection = selectStrategyByManifest(signals);
      expect(selection?.strategy, JSON.stringify(signals)).toBe(expected);
    }
  });

  it('routes a SYNTHETIC 9th manifest with NO router edit (#3836 invariant)', () => {
    // A novel strategy carrying its own high-priority rule for a previously
    // unclaimed signal combination. The matcher selects it with zero code change,
    // proving "adding a capability = registering a manifest, not editing router".
    const ninth: StrategyManifest = {
      id: 'simulation',
      schemaVersion: 1,
      strategy: 'spec', // reuse a valid enum member; the id is what's novel here
      entrypointTool: 'run_simulation',
      executorAvailable: false,
      description: 'Synthetic 9th strategy for the no-router-edit invariant test.',
      maturityTier: 'experimental',
      latencyClass: 'async-job-body',
      selectionRules: [{ priority: 200, patterns: ['graph'], pipelineTypes: ['research'] }],
    };
    const augmented = [...STRATEGY_MANIFEST_REGISTRY.manifests, ninth];
    const selection = selectStrategyByManifest(
      { pattern: 'graph', pipelineType: 'research', complexity: 'complex' },
      augmented
    );
    expect(selection?.manifest.id).toBe('simulation');
    expect(selection?.rule.priority).toBe(200);
  });

  it('returns undefined when no manifest rule matches the signals', () => {
    // A manifest with no selection rules is never auto-routed.
    const ruleless: StrategyManifest[] = [
      {
        id: 'orphan',
        schemaVersion: 1,
        strategy: 'spec',
        entrypointTool: 'execute_spec',
        executorAvailable: false,
        description: 'Force-only manifest with no selection rules.',
        maturityTier: 'beta',
        latencyClass: 'async-job-body',
      },
    ];
    expect(
      selectStrategyByManifest(
        { pattern: 'graph', pipelineType: 'dev', complexity: 'moderate' },
        ruleless
      )
    ).toBeUndefined();
  });
});

describe('governance YAML mirror', () => {
  it('the embedded TS registry equals governance/strategy-manifests.yaml (no drift)', () => {
    // src/orchestration -> repo root is four levels up.
    const repoRoot = join(import.meta.dirname, '..', '..', '..', '..');
    const yamlPath = join(repoRoot, 'governance', 'strategy-manifests.yaml');
    const fromYaml = parseStrategyManifestRegistry(readFileSync(yamlPath, 'utf-8'));
    expect(fromYaml).toEqual(STRATEGY_MANIFEST_REGISTRY);
  });
});
