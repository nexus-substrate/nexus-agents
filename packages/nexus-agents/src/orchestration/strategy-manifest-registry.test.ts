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
} from './strategy-manifest-registry.js';
import { parseStrategyManifestRegistry } from './strategy-manifest.js';
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

describe('governance YAML mirror', () => {
  it('the embedded TS registry equals governance/strategy-manifests.yaml (no drift)', () => {
    // src/orchestration -> repo root is four levels up.
    const repoRoot = join(import.meta.dirname, '..', '..', '..', '..');
    const yamlPath = join(repoRoot, 'governance', 'strategy-manifests.yaml');
    const fromYaml = parseStrategyManifestRegistry(readFileSync(yamlPath, 'utf-8'));
    expect(fromYaml).toEqual(STRATEGY_MANIFEST_REGISTRY);
  });
});
