/**
 * Consolidated tool-registry consistency guard (#3565, evergreen DRY epic #3568).
 *
 * Several parallel registries are keyed by MCP tool name and must stay in sync
 * with the canonical `REGISTERED_TOOL_NAMES`. Before this test, only a few had
 * freshness coverage — `TOOL_TIER_MAP`, the two `READ_ONLY_TOOLS` sets, and the
 * prerequisite maps could drift (e.g. keep a dangling entry for a removed/renamed
 * tool) silently. This is the single audit surface: one clear failure listing
 * exactly which registry has an orphan key or is missing an entry.
 *
 * Two contracts:
 * - COMPLETE registries must have an entry for every registered tool, no extras.
 * - SUBSET registries (intentional overrides/allowlists) may omit tools, but
 *   every key MUST be a real registered tool — no orphans.
 */

import { describe, it, expect } from 'vitest';
import { REGISTERED_TOOL_NAMES } from './index.js';
import { TOOL_ANNOTATIONS } from './tool-annotations.js';
import { TOOL_PREREQUISITES, NO_PREREQUISITE } from '../middleware/tool-prerequisites.js';
import { READ_ONLY_TOOLS as READ_ONLY_RISK } from '../../security/access-constraint-deriver/tool-risk.js';
import { TOOL_TIER_MAP } from '../gateway/tier-classifier.js';

// NOTE: middleware/policy-rules.ts also exports a READ_ONLY_TOOLS set, but it is
// a DIFFERENT vocabulary — generic agent/filesystem tools (read_file, bash, …)
// for the access/mutation policy, NOT MCP tool names — so it is intentionally
// excluded from this MCP-tool-registry guard.

const REGISTERED = new Set<string>(REGISTERED_TOOL_NAMES);

/** Keys of a registry that are NOT registered tools (drift — should be empty). */
function orphanKeys(keys: Iterable<string>): string[] {
  return [...keys].filter((k) => !REGISTERED.has(k)).sort();
}

describe('tool-registry consistency vs REGISTERED_TOOL_NAMES (#3565)', () => {
  it('canonical list is unique and non-empty', () => {
    expect(REGISTERED_TOOL_NAMES.length).toBeGreaterThan(0);
    expect(REGISTERED.size).toBe(REGISTERED_TOOL_NAMES.length);
  });

  describe('complete registries — one entry per registered tool, no extras', () => {
    it('TOOL_ANNOTATIONS covers exactly the registered tools', () => {
      expect(Object.keys(TOOL_ANNOTATIONS).sort()).toEqual([...REGISTERED_TOOL_NAMES].sort());
    });
  });

  describe('subset registries — may omit tools, but no orphan keys', () => {
    const subsets: ReadonlyArray<readonly [string, Iterable<string>]> = [
      ['TOOL_PREREQUISITES', Object.keys(TOOL_PREREQUISITES)],
      ['NO_PREREQUISITE', Object.keys(NO_PREREQUISITE)],
      ['READ_ONLY_TOOLS (tool-risk)', READ_ONLY_RISK],
      ['TOOL_TIER_MAP', Object.keys(TOOL_TIER_MAP)],
    ];
    it.each(subsets)('%s has no orphan keys', (_name, keys) => {
      expect(orphanKeys(keys)).toEqual([]);
    });
  });
});
