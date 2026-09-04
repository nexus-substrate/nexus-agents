/**
 * Strategy-manifest registry drift gate (#3837, Epic C / M2).
 *
 * The strategy-manifest registry is the single source of truth for the routable
 * execution strategies the MetaOrchestrator can select. It lives in TWO places by
 * design — the human-facing `governance/strategy-manifests.yaml` and the embedded
 * typed constant `STRATEGY_MANIFEST_REGISTRY` (no disk I/O on the MCP hot path) —
 * so it CAN drift. #3835 added a Vitest "YAML↔TS no-drift" test; #3837 ELEVATES
 * that to an enforced governance gate (CI), consistent with `claims:check`, so a
 * divergence fails the build the same way every other single-source registry does.
 *
 * The gate fails when ANY of:
 *   (a) `governance/strategy-manifests.yaml` is out of sync with the embedded
 *       `STRATEGY_MANIFEST_REGISTRY` (YAML↔TS drift);
 *   (b) the manifest set is not in exact 1:1 correspondence with the
 *       `ExecutionStrategy` union — a union member with no manifest, a manifest
 *       for an unknown strategy, or a duplicated strategy (completeness/uniqueness);
 *   (c) the YAML no longer validates against the #3834 Zod schema (the
 *       `parseStrategyManifestRegistry` parse throws).
 *
 * Wired into `inject-governance.ts check` (the `governance:check` gate / the
 * docs-check `governance-drift` job) alongside the other registry drift gates,
 * and exposed standalone as `pnpm strategy-manifest:check`.
 *
 * @module scripts/check-strategy-manifest-drift
 * (Source: Issue #3833, #3837 — schema #3834, registry #3835)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SRC_ROOT } from './script-paths.js';
import { parseStrategyManifestRegistry } from '../packages/nexus-agents/src/orchestration/strategy-manifest.js';
import { STRATEGY_MANIFEST_REGISTRY } from '../packages/nexus-agents/src/orchestration/strategy-manifest-registry.js';

const MANIFEST_YAML = join(ROOT, 'governance/strategy-manifests.yaml');
const META_ORCHESTRATOR = join(SRC_ROOT, 'orchestration/meta-orchestrator.ts');

/**
 * Parse the `ExecutionStrategy` union members from `meta-orchestrator.ts` source
 * (the router's authoritative enum). Read from source — not imported as a type,
 * which erases at runtime — so the gate compares the registry against the actual
 * union literal a reviewer edits. Returns the quoted string-literal members of
 * `export type ExecutionStrategy = …;`.
 */
export function extractExecutionStrategies(source: string): string[] {
  const match = /export\s+type\s+ExecutionStrategy\s*=([\s\S]*?);/.exec(source);
  if (match?.[1] === undefined) {
    throw new Error(
      'Could not locate `export type ExecutionStrategy = …;` in meta-orchestrator.ts (#3837)'
    );
  }
  return [...match[1].matchAll(/'([^']+)'/g)]
    .map((m) => m[1])
    .filter((s): s is string => s !== undefined);
}

/** A single drift finding (one line of CI output). */
export interface ManifestDriftFinding {
  readonly code: 'yaml-ts-drift' | 'missing-manifest' | 'extra-manifest' | 'duplicate-strategy';
  readonly message: string;
}

interface DriftInputs {
  /** Raw text of governance/strategy-manifests.yaml. */
  readonly yamlText: string;
  /** Raw text of meta-orchestrator.ts (for the ExecutionStrategy union). */
  readonly metaSource: string;
}

/**
 * Pure drift analysis (no disk / process I/O) so it is unit-testable with
 * injected — possibly mutated — sources. Throws (via `parseStrategyManifestRegistry`)
 * if the YAML fails schema validation (gate condition (c)); otherwise returns the
 * findings for (a) YAML↔TS drift and (b) completeness/uniqueness.
 */
export function analyzeManifestDrift(inputs: DriftInputs): ManifestDriftFinding[] {
  const findings: ManifestDriftFinding[] = [];

  // (c) YAML must validate against the #3834 Zod schema. A failure throws here;
  // the caller renders it as a load/validation failure.
  const fromYaml = parseStrategyManifestRegistry(inputs.yamlText);

  // (a) YAML↔TS: the parsed YAML must deep-equal the embedded typed constant.
  const yamlJson = JSON.stringify(fromYaml);
  const tsJson = JSON.stringify(STRATEGY_MANIFEST_REGISTRY);
  if (yamlJson !== tsJson) {
    findings.push({
      code: 'yaml-ts-drift',
      message:
        'governance/strategy-manifests.yaml is out of sync with the embedded ' +
        'STRATEGY_MANIFEST_REGISTRY (strategy-manifest-registry.ts). Reconcile the two.',
    });
  }

  // (b) completeness + uniqueness vs the ExecutionStrategy union. Check against the
  // embedded constant (the runtime source of truth) so this holds even if (a) fired.
  const unionMembers = extractExecutionStrategies(inputs.metaSource);
  const unionSet = new Set(unionMembers);
  const manifestStrategies = STRATEGY_MANIFEST_REGISTRY.manifests.map((m) => m.strategy);

  const counts = new Map<string, number>();
  for (const s of manifestStrategies) counts.set(s, (counts.get(s) ?? 0) + 1);

  for (const [strategy, n] of counts) {
    if (n > 1) {
      findings.push({
        code: 'duplicate-strategy',
        message: `strategy '${strategy}' has ${String(n)} manifests — a strategy must be fronted by exactly one.`,
      });
    }
  }
  for (const member of unionSet) {
    if (!counts.has(member)) {
      findings.push({
        code: 'missing-manifest',
        message: `ExecutionStrategy '${member}' has no manifest — register one in governance/strategy-manifests.yaml.`,
      });
    }
  }
  for (const strategy of counts.keys()) {
    if (!unionSet.has(strategy)) {
      findings.push({
        code: 'extra-manifest',
        message: `manifest declares strategy '${strategy}' which is not a member of the ExecutionStrategy union.`,
      });
    }
  }

  return findings;
}

/**
 * The CI gate entry point. Reads the registry sources from disk, runs the drift
 * analysis, and prints structured errors. Returns true when the registry is
 * honest (no drift). A schema-validation failure (c) or a missing file fails
 * closed with `false`.
 */
export function checkStrategyManifestRegistry(): boolean {
  if (!existsSync(MANIFEST_YAML)) {
    console.error(`Strategy-manifest registry not found: ${MANIFEST_YAML} (#3837)`);
    return false;
  }
  if (!existsSync(META_ORCHESTRATOR)) {
    console.error(`meta-orchestrator.ts not found: ${META_ORCHESTRATOR} (#3837)`);
    return false;
  }

  let findings: ManifestDriftFinding[];
  try {
    findings = analyzeManifestDrift({
      yamlText: readFileSync(MANIFEST_YAML, 'utf-8'),
      metaSource: readFileSync(META_ORCHESTRATOR, 'utf-8'),
    });
  } catch (err) {
    // (c) schema validation failure (or unparseable union).
    console.error(
      `Strategy-manifest registry failed to load/validate (#3837): ${(err as Error).message}`
    );
    return false;
  }

  if (findings.length === 0) return true;

  console.error('Strategy-manifest registry drift (#3837):');
  for (const f of findings) console.error(`  - [${f.code}] ${f.message}`);
  console.error('  Reconcile governance/strategy-manifests.yaml with the embedded registry and');
  console.error('  the ExecutionStrategy union, then re-run: pnpm strategy-manifest:check');
  return false;
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  process.exit(checkStrategyManifestRegistry() ? 0 : 1);
}
