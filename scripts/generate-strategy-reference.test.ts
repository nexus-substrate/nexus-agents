/**
 * Tests for the strategy-manifest reference generator (#3838).
 *
 * Asserts the generated force-strategy reference is DERIVED from the manifest
 * registry (every strategy + its key fields surface) and that the committed
 * docs/reference/strategies/index.md is in sync (the drift-gate contract).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderReferencePage, sortedManifests } from './generate-strategy-reference.js';
import { STRATEGY_MANIFEST_REGISTRY } from '../packages/nexus-agents/src/orchestration/strategy-manifest-registry.js';

const ROOT = join(import.meta.dirname, '..');
const DOC_PATH = join(ROOT, 'docs', 'reference', 'strategies', 'index.md');

describe('generate-strategy-reference', () => {
  it('renders one row per registered manifest', () => {
    const out = renderReferencePage(sortedManifests());
    for (const m of STRATEGY_MANIFEST_REGISTRY.manifests) {
      // Strategy id, entrypoint tool, and per-strategy heading all present.
      expect(out).toContain(`\`${m.strategy}\``);
      expect(out).toContain(`\`${m.entrypointTool}\``);
      expect(out).toContain(`### \`${m.strategy}\``);
      expect(out).toContain(m.description);
    }
  });

  it('surfaces each manifest field the issue requires', () => {
    const out = renderReferencePage(sortedManifests());
    for (const m of STRATEGY_MANIFEST_REGISTRY.manifests) {
      expect(out).toContain(`**Maturity tier:** ${m.maturityTier}`);
      if (m.whenToForce !== undefined) {
        expect(out).toContain(m.whenToForce);
      }
      if (m.authorityTier !== undefined) {
        expect(out).toContain(`**Authority tier:** ${m.authorityTier}`);
      }
      // Executor availability is rendered as a human label, not the raw boolean.
      expect(out).toContain(m.executorAvailable ? 'wired (runs inline' : 'fail-closed (no inline');
    }
  });

  it('positions run as canonical and the strategies as force-strategy escape hatches', () => {
    const out = renderReferencePage(sortedManifests());
    expect(out).toContain('canonical entry point');
    expect(out).toContain('force-strategy escape hatches');
  });

  it('committed doc is in sync with the registry (drift gate)', () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    const committed = readFileSync(DOC_PATH, 'utf-8');
    expect(committed).toBe(renderReferencePage(sortedManifests()));
  });
});
