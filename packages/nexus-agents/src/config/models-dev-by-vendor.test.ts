/**
 * Tests for key-free CLI model enumeration via models.dev (#3405).
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  listModelsByVendor,
  listModelsForCli,
  resetModelsDevByVendorCache,
  CLI_TO_MODELSDEV_VENDOR,
} from './models-dev-by-vendor.js';

afterEach(() => {
  resetModelsDevByVendorCache();
});

describe('models-dev-by-vendor (#3405)', () => {
  it('lists anthropic models for the claude CLI (incl. a claude id)', () => {
    const models = listModelsForCli('claude');
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === 'anthropic')).toBe(true);
    expect(models.some((m) => m.id.startsWith('claude-'))).toBe(true);
  });

  it('lists openai models for codex and google models for gemini', () => {
    expect(listModelsForCli('codex').length).toBeGreaterThan(0);
    expect(listModelsForCli('codex').every((m) => m.provider === 'openai')).toBe(true);
    expect(listModelsForCli('gemini').length).toBeGreaterThan(0);
    expect(listModelsForCli('gemini').every((m) => m.provider === 'google')).toBe(true);
  });

  it('returns [] for a CLI without a vendor mapping (e.g. opencode)', () => {
    expect(listModelsForCli('opencode')).toEqual([]);
    expect(listModelsForCli('unknown-cli')).toEqual([]);
  });

  it('filters strictly by vendor', () => {
    const anthropic = listModelsByVendor('anthropic');
    const google = listModelsByVendor('google');
    const ids = new Set(anthropic.map((m) => m.id));
    expect(google.some((m) => ids.has(m.id))).toBe(false);
  });

  it('maps every known CLI to a real vendor key present in the snapshot', () => {
    for (const vendor of Object.values(CLI_TO_MODELSDEV_VENDOR)) {
      expect(listModelsByVendor(vendor).length).toBeGreaterThan(0);
    }
  });
});
