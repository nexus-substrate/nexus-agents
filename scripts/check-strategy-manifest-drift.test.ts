/**
 * Tests for the strategy-manifest drift gate (#3837).
 *
 * RED/GREEN: the gate must PASS on the honest committed state and FAIL when the
 * YAML is mutated to diverge from the embedded `STRATEGY_MANIFEST_REGISTRY`, when
 * a manifest is dropped/added relative to the `ExecutionStrategy` union, and when
 * the YAML no longer validates against the #3834 Zod schema.
 *
 * @module scripts/check-strategy-manifest-drift.test
 * (Source: Issue #3837)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyzeManifestDrift,
  extractExecutionStrategies,
} from './check-strategy-manifest-drift.js';
import { ROOT, SRC_ROOT } from './script-paths.js';

const YAML_PATH = join(ROOT, 'governance/strategy-manifests.yaml');
const META_PATH = join(SRC_ROOT, 'orchestration/meta-orchestrator.ts');

const HONEST_YAML = readFileSync(YAML_PATH, 'utf-8');
const META_SOURCE = readFileSync(META_PATH, 'utf-8');

describe('strategy-manifest drift gate (#3837)', () => {
  it('GREEN: no findings on the honest committed registry', () => {
    const findings = analyzeManifestDrift({ yamlText: HONEST_YAML, metaSource: META_SOURCE });
    expect(findings).toEqual([]);
  });

  it('RED (a): fails when the YAML diverges from the embedded constant', () => {
    // Flip a value that is valid against the schema but no longer matches the TS
    // constant — pure YAML↔TS drift (entrypointTool of single-shot).
    const drifted = HONEST_YAML.replace(
      'entrypointTool: delegate_to_model',
      'entrypointTool: some_other_tool'
    );
    expect(drifted).not.toBe(HONEST_YAML);
    const findings = analyzeManifestDrift({ yamlText: drifted, metaSource: META_SOURCE });
    expect(findings.some((f) => f.code === 'yaml-ts-drift')).toBe(true);
  });

  it('RED (c): fails (throws) when the YAML no longer validates against the schema', () => {
    // maturityTier must be one of experimental|beta|stable — an invalid enum
    // value makes the Zod parse throw, which the gate renders as a load failure.
    const invalid = HONEST_YAML.replace('maturityTier: stable', 'maturityTier: legendary');
    expect(invalid).not.toBe(HONEST_YAML);
    expect(() => analyzeManifestDrift({ yamlText: invalid, metaSource: META_SOURCE })).toThrow();
  });

  it('RED (b): reports a missing manifest when the union gains a member', () => {
    // Inject a 9th union member with no manifest behind it.
    const augmentedMeta = META_SOURCE.replace(
      "  | 'research';",
      "  | 'research'\n  /** synthetic test member */\n  | 'simulation';"
    );
    expect(augmentedMeta).not.toBe(META_SOURCE);
    const findings = analyzeManifestDrift({ yamlText: HONEST_YAML, metaSource: augmentedMeta });
    expect(
      findings.some((f) => f.code === 'missing-manifest' && f.message.includes('simulation'))
    ).toBe(true);
  });

  it('parses all 8 ExecutionStrategy union members from source', () => {
    const members = extractExecutionStrategies(META_SOURCE);
    expect(members.sort()).toEqual(
      [
        'single-shot',
        'dev-pipeline',
        'pipeline',
        'graph-workflow',
        'orchestrate',
        'consensus',
        'spec',
        'research',
      ].sort()
    );
  });
});
