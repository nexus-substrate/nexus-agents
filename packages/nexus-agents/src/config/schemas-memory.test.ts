/**
 * nexus-agents/config - Memory Configuration Schema Tests
 *
 * #5097 finding 2: `MemoryDecayManager` was constructed with a hardcoded `{}`,
 * so its nine knobs were permanently default. These tests pin the boundary
 * that now feeds it: `memory.decay` in nexus-agents.yaml.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { MemoryDecayConfigSchema, MemoryConfigSchema } from './schemas-memory.js';
import { AppConfigSchema } from './schemas.js';
import { DEFAULT_DECAY_CONFIG, type MemoryDecayConfig } from '../mcp/tools/memory-decay.js';

/** Minimal valid AppConfig — `models` is the only required section. */
const BASE_APP_CONFIG = {
  models: {
    default: 'claude-sonnet',
    tiers: { fast: ['claude-haiku'], balanced: ['claude-sonnet'], powerful: ['claude-opus'] },
  },
};

/** Repo root, from `<root>/packages/nexus-agents/src/config/`. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CONFIG_MD = readFileSync(join(REPO_ROOT, 'docs/getting-started/CONFIGURATION.md'), 'utf8');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keys indented directly beneath `memory:` in YAML examples. */
function documentedMemoryKeys(): string[] {
  const found = new Set<string>();
  for (const blockMatch of CONFIG_MD.matchAll(/```ya?ml\n([\s\S]*?)```/g)) {
    const block = blockMatch[1];
    if (block === undefined) continue;
    const parsed: unknown = parseYaml(block);
    if (!isRecord(parsed)) continue;
    const memory = parsed['memory'];
    if (!isRecord(memory)) continue;
    for (const key of Object.keys(memory)) found.add(key);
  }
  return [...found].sort();
}

describe('MemoryDecayConfigSchema (#5097)', () => {
  it('accepts a non-default cap and hands it through unchanged', () => {
    // 1234 differs from the 10000 default so identity cannot pass.
    const result = MemoryDecayConfigSchema.safeParse({ agenticMaxEntries: 1234 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.agenticMaxEntries).toBe(1234);
  });

  it('accepts the documented 1000 ms interval floor', () => {
    const result = MemoryDecayConfigSchema.safeParse({ decayIntervalMs: 1000 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.decayIntervalMs).toBe(1000);
  });

  it('accepts enabled: false', () => {
    const result = MemoryDecayConfigSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(false);
  });

  it('leaves unset knobs absent so DEFAULT_DECAY_CONFIG stays the single authority', () => {
    // The schema deliberately carries NO defaults of its own: a second copy of
    // the defaults here would drift from memory-decay.ts silently.
    const result = MemoryDecayConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({});
  });

  it('exposes every DEFAULT_DECAY_CONFIG knob so a new knob cannot be silently unconfigurable', () => {
    const schemaKeys = Object.keys(MemoryDecayConfigSchema.shape).sort();
    const knobKeys = Object.keys(DEFAULT_DECAY_CONFIG).sort();
    expect(schemaKeys).toEqual(knobKeys);
  });

  it('parsed output matches the value types of MemoryDecayConfig', () => {
    // Compile-time seam: if a schema field's type drifted from the manager's
    // config type this assignment would fail tsc. Loose-optional because zod's
    // output allows `key: undefined` under exactOptionalPropertyTypes; the
    // tool-memory seam strips those before the overlay.
    const parsed = MemoryDecayConfigSchema.parse({ decayIntervalMs: 5000 });
    const asLoose: { [K in keyof MemoryDecayConfig]?: MemoryDecayConfig[K] | undefined } = parsed;
    expect(asLoose.decayIntervalMs).toBe(5000);
  });

  it.each([
    ['negative interval', { decayIntervalMs: -1 }, 'decayIntervalMs'],
    ['zero interval', { decayIntervalMs: 0 }, 'decayIntervalMs'],
    // Sweeps are not re-entrant; a sub-second cadence invites overlapping runs.
    ['sub-second interval', { decayIntervalMs: 999 }, 'decayIntervalMs'],
    ['non-integer cap', { agenticMaxEntries: 10.5 }, 'agenticMaxEntries'],
    ['zero cap', { agenticMaxEntries: 0 }, 'agenticMaxEntries'],
    ['unsafe integer cap', { agenticMaxEntries: Number.MAX_SAFE_INTEGER + 2 }, 'agenticMaxEntries'],
    ['threshold above 1', { agenticImportanceThreshold: 1.5 }, 'agenticImportanceThreshold'],
    ['threshold below 0', { adaptivePriorityThreshold: -0.1 }, 'adaptivePriorityThreshold'],
    ['negative grace period', { crossReferenceGracePeriodMs: -1 }, 'crossReferenceGracePeriodMs'],
    ['non-integer max age', { beliefMaxAgeDays: 1.5 }, 'beliefMaxAgeDays'],
    ['string where boolean expected', { enabled: 'yes' }, 'enabled'],
  ])('rejects %s and names the offending field', (_label, input, field) => {
    const result = MemoryDecayConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain(field);
    }
  });
});

describe('memory section of AppConfigSchema (#5097)', () => {
  it('accepts memory.decay through MemoryConfigSchema', () => {
    const result = MemoryConfigSchema.safeParse({ decay: { enabled: false } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.decay).toEqual({ enabled: false });
  });

  it('threads memory.decay through the top-level config', () => {
    const result = AppConfigSchema.safeParse({
      ...BASE_APP_CONFIG,
      memory: { decay: { agenticMaxEntries: 1234, enabled: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.memory?.decay).toEqual({ agenticMaxEntries: 1234, enabled: false });
    }
  });

  it('leaves memory undefined when the section is absent', () => {
    const result = AppConfigSchema.safeParse(BASE_APP_CONFIG);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.memory).toBeUndefined();
  });

  it('rejects an invalid decay value at the top level with a full path', () => {
    const result = AppConfigSchema.safeParse({
      ...BASE_APP_CONFIG,
      memory: { decay: { decayIntervalMs: -5 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('memory.decay.decayIntervalMs');
    }
  });

  it('MemoryConfigSchema accepts an empty memory section', () => {
    const result = MemoryConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.decay).toBeUndefined();
  });

  it.each(['session', 'graph', 'typed'])('rejects unknown memory.%s and names it', (key) => {
    const result = AppConfigSchema.safeParse({
      ...BASE_APP_CONFIG,
      memory: { [key]: {} },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (candidate) => candidate.code === 'unrecognized_keys' && candidate.keys.includes(key)
      );
      expect(issue?.path).toEqual(['memory']);
      expect(issue?.message).toContain(key);
    }
  });
});

describe('documented memory keys match MemoryConfigSchema (#5494)', () => {
  it('finds every direct memory key in YAML examples and recognizes it in the schema', () => {
    const documentedKeys = documentedMemoryKeys();
    expect(documentedKeys).not.toHaveLength(0);
    expect(documentedKeys).toEqual(Object.keys(MemoryConfigSchema.shape).sort());
  });
});
