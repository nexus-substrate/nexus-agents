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
  rankStrategiesByManifest,
  strategyCostProfiles,
} from './strategy-manifest-registry.js';
import {
  parseStrategyManifestRegistry,
  type StrategyManifest,
  type CostProfile,
} from './strategy-manifest.js';
import { buildDefaultExecutors } from '../mcp/tools/run-tool.js';
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

describe('executorAvailable cross-check against the LIVE executor registry (#3881)', () => {
  // The #3881 fix: executorAvailable was a self-declared boolean never checked
  // against the real wired executors. The LEGACY_EXECUTOR_AVAILABLE snapshot above
  // is a FROZEN copy and can rot; here we derive the wired set from the LIVE
  // buildDefaultExecutors factory so a manifest claiming executorAvailable:true for
  // a strategy with NO wired executor (fail-OPEN) — or :false for one that IS wired
  // — fails the build. trustTier is irrelevant to which KEYS exist, so a fixed
  // value is fine.
  const LIVE_WIRED_EXECUTORS = new Set(
    Object.keys(buildDefaultExecutors('3')) as ExecutionStrategy[]
  );

  it('every wired executor in buildDefaultExecutors maps to a registered strategy', () => {
    for (const s of LIVE_WIRED_EXECUTORS) {
      expect(
        getStrategyManifest(s),
        `executor wired for unregistered strategy '${s}'`
      ).toBeDefined();
    }
  });

  it("each manifest's executorAvailable matches whether the LIVE factory provides an executor", () => {
    for (const s of ALL_STRATEGIES) {
      const liveAvailable = LIVE_WIRED_EXECUTORS.has(s);
      const declared = String(executorAvailableFor(s));
      expect(
        executorAvailableFor(s),
        `executorAvailable for '${s}' is self-declared ${declared} but the live ` +
          `buildDefaultExecutors ${liveAvailable ? 'DOES' : 'does NOT'} provide an executor — ` +
          `fail-${liveAvailable ? 'closed-on-a-wired-strategy' : 'open'} drift (#3881)`
      ).toBe(liveAvailable);
    }
  });

  it('the legacy snapshot itself still matches the live factory (snapshot has not rotted)', () => {
    // Keeps LEGACY_EXECUTOR_AVAILABLE honest: if someone wires/unwires an executor
    // in run-tool.ts and updates the manifests but forgets this frozen snapshot,
    // this catches the snapshot rot rather than letting the parity test pass on
    // stale data.
    for (const s of ALL_STRATEGIES) {
      expect(LIVE_WIRED_EXECUTORS.has(s), `legacy snapshot stale for '${s}'`).toBe(
        LEGACY_EXECUTOR_AVAILABLE[s]
      );
    }
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

describe('every registered manifest is routable (#3888 — optional selectionRules guard)', () => {
  // GUARD: `selectionRules` is `.optional()` on the schema so a force-only manifest
  // is legal, but a manifest registered in the LIVE registry with no rules is
  // silently un-routable (selectStrategyByManifest skips it). This test fails the
  // suite the moment a future manifest is added to STRATEGY_MANIFEST_REGISTRY
  // without at least one selection rule — surfacing the un-routability loudly.
  it('every manifest in STRATEGY_MANIFEST_REGISTRY declares >=1 selectionRule', () => {
    for (const m of STRATEGY_MANIFEST_REGISTRY.manifests) {
      expect(
        m.selectionRules,
        `manifest '${m.id}' has no selectionRules — it would be silently un-routable`
      ).toBeDefined();
      expect(
        m.selectionRules?.length ?? 0,
        `manifest '${m.id}' has an empty selectionRules array — un-routable`
      ).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('fail-fast tie-break on equal-priority collision (#3888)', () => {
  it('throws on a genuine equal-priority match between two strategies', () => {
    // Inject a 9th manifest whose rule collides at the SAME priority on the SAME
    // signal as an existing manifest. The old behaviour silently routed by
    // alphabetical strategy name; the hardened matcher must surface the ambiguity.
    const collider: StrategyManifest = {
      id: 'collider',
      schemaVersion: 1,
      strategy: 'spec', // alphabetically 'spec' > 'graph-workflow'
      entrypointTool: 'execute_spec',
      executorAvailable: false,
      description: 'Synthetic manifest colliding with graph-workflow at equal priority.',
      maturityTier: 'experimental',
      latencyClass: 'async-job-body',
      // graph-workflow uses { priority: 50, patterns: ['graph'] } — collide exactly.
      selectionRules: [{ priority: 50, patterns: ['graph'] }],
    };
    const augmented = [...STRATEGY_MANIFEST_REGISTRY.manifests, collider];
    expect(() =>
      selectStrategyByManifest(
        { pattern: 'graph', pipelineType: 'dev', complexity: 'moderate' },
        augmented
      )
    ).toThrow(/equal-priority|ambiguous/i);
  });

  it('does NOT throw for the live 8 manifests (no reachable collision today)', () => {
    // Sanity: every live signal combination resolves without ambiguity.
    const combos = [
      { pattern: 'consensus', pipelineType: 'general', complexity: 'moderate' },
      { pattern: 'graph', pipelineType: 'audit', complexity: 'moderate' },
      { pattern: 'wave', pipelineType: 'dev', complexity: 'complex' },
      { pattern: 'sequential', pipelineType: 'greenfield', complexity: 'moderate' },
      { pattern: 'sequential', pipelineType: 'research', complexity: 'moderate' },
      { pattern: 'sequential', pipelineType: 'audit', complexity: 'simple' },
      { pattern: 'sequential', pipelineType: 'dev', complexity: 'simple' },
      { pattern: 'sequential', pipelineType: 'general', complexity: 'expert' },
    ] as const;
    for (const c of combos) {
      expect(() => selectStrategyByManifest(c)).not.toThrow();
    }
  });
});

describe('manifest-derived alternatives ranking (#3888 — split-brain fix)', () => {
  it('ranks every OTHER matching strategy best-first by matching-rule priority', () => {
    // Signals where multiple manifests have a matching rule at different priorities.
    // sequential + audit: pipeline(80, audit+sequential) AND dev-pipeline(30, sequential)
    // both match. Best-first ranking must put the higher-priority pipeline ahead.
    const ranked = rankStrategiesByManifest({
      pattern: 'sequential',
      pipelineType: 'audit',
      complexity: 'moderate',
    });
    expect(ranked).toEqual(['pipeline', 'dev-pipeline']);
  });

  it('returns only genuinely-matching strategies (no hardcoded table)', () => {
    // graph pattern: only graph-workflow has a matching rule. Nothing else routes.
    const ranked = rankStrategiesByManifest({
      pattern: 'graph',
      pipelineType: 'dev',
      complexity: 'moderate',
    });
    expect(ranked).toEqual(['graph-workflow']);
  });

  it('throws on an equal-priority collision (same fail-fast contract as selection)', () => {
    const collider: StrategyManifest = {
      id: 'collider',
      schemaVersion: 1,
      strategy: 'spec',
      entrypointTool: 'execute_spec',
      executorAvailable: false,
      description: 'Synthetic colliding manifest.',
      maturityTier: 'experimental',
      latencyClass: 'async-job-body',
      selectionRules: [{ priority: 50, patterns: ['graph'] }],
    };
    const augmented = [...STRATEGY_MANIFEST_REGISTRY.manifests, collider];
    expect(() =>
      rankStrategiesByManifest(
        { pattern: 'graph', pipelineType: 'dev', complexity: 'moderate' },
        augmented
      )
    ).toThrow(/equal-priority|ambiguous/i);
  });
});

describe('cost profiles (Epic G, #3856)', () => {
  /** The graded cost profile per strategy — the fan-out scaling #3856 authored. */
  const EXPECTED_COST_PROFILES: Readonly<Record<ExecutionStrategy, CostProfile>> = {
    'single-shot': 'low',
    'dev-pipeline': 'medium',
    pipeline: 'medium',
    'graph-workflow': 'variable',
    orchestrate: 'high',
    consensus: 'high',
    spec: 'high',
    research: 'variable',
  };

  it('every live strategy declares a costProfile', () => {
    for (const m of STRATEGY_MANIFEST_REGISTRY.manifests) {
      expect(m.costProfile, `costProfile missing for '${m.strategy}'`).toBeDefined();
    }
  });

  it('costProfile matches the graded fan-out scaling for all 8', () => {
    for (const s of ALL_STRATEGIES) {
      expect(getStrategyManifest(s)?.costProfile, `costProfile mismatch for '${s}'`).toBe(
        EXPECTED_COST_PROFILES[s]
      );
    }
  });

  it('strategyCostProfiles() surfaces every strategy, sorted by name', () => {
    const profiles = strategyCostProfiles();
    expect(profiles).toHaveLength(ALL_STRATEGIES.length);
    const names = profiles.map((p) => p.strategy);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    for (const p of profiles) {
      expect(p.costProfile).toBe(EXPECTED_COST_PROFILES[p.strategy]);
      expect(p.entrypointTool).toBe(entrypointToolFor(p.strategy));
    }
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

describe('executeEnvelope declaration gate (#4655)', () => {
  // The consensus panel (6-1, option D) made one condition explicit, raised
  // independently by the dissenting seat and an approving one: an envelope
  // broad enough to be unfalsifiable recreates the vacuous check one level
  // down. These are the checks that keep the declaration a measurement.

  it('an envelope is declared for exactly the strategies that can execute', () => {
    for (const s of ALL_STRATEGIES) {
      const manifest = getStrategyManifest(s);
      const declared = manifest?.executeEnvelope !== undefined;
      // Absence means "cannot execute", never "unbounded" — so the envelope and
      // the wired-executor flag must agree, or one of them is lying.
      expect(declared, `executeEnvelope/executorAvailable disagree for '${s}'`).toBe(
        executorAvailableFor(s)
      );
    }
  });

  it('no envelope is unbounded — the maximum in every dimension is refused', () => {
    for (const s of ALL_STRATEGIES) {
      const env = getStrategyManifest(s)?.executeEnvelope;
      if (env === undefined) continue;
      const maxedOut =
        env.filesystem === 'repo' &&
        env.spawn === 'dev-tooling' &&
        env.network.includes('web') &&
        env.vcs === 'push';
      expect(maxedOut, `'${s}' declares an envelope that permits everything`).toBe(false);
    }
  });

  it("research's envelope matches pipeline's, because it is a literal alias", () => {
    // run-tool.ts:288 registers the pipeline executor under `research`. If the
    // two envelopes drift, one of them is describing code it does not run.
    expect(getStrategyManifest('research')?.executeEnvelope).toEqual(
      getStrategyManifest('pipeline')?.executeEnvelope
    );
  });
});
