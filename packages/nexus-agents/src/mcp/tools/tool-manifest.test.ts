/**
 * Parity tests for the canonical TOOL_MANIFEST (#3566). These are the lockstep
 * guards the refactor relies on: every other tool-name list derives from or is
 * validated against the manifest, so drift fails loudly here.
 */

import { describe, it, expect } from 'vitest';
import { TOOL_MANIFEST } from './tool-manifest.js';
import { REGISTERED_TOOL_NAMES, TOOL_ANNOTATIONS } from './index.js';
import { getAvailableToolCount } from '../../core/task-analysis/capability-gap-detector.js';

describe('TOOL_MANIFEST (canonical tool list)', () => {
  it('has no duplicate names', () => {
    expect(new Set(TOOL_MANIFEST).size).toBe(TOOL_MANIFEST.length);
  });

  it('is the exact source of REGISTERED_TOOL_NAMES (same order)', () => {
    // REGISTERED_TOOL_NAMES is a derived re-export of the manifest.
    expect([...REGISTERED_TOOL_NAMES]).toEqual([...TOOL_MANIFEST]);
  });

  it('matches TOOL_ANNOTATIONS keys exactly (no annotation drift)', () => {
    // Every manifest tool has an annotation entry and vice-versa.
    expect(new Set(Object.keys(TOOL_ANNOTATIONS))).toEqual(new Set(TOOL_MANIFEST));
  });

  it('is the basis for the capability-gap detector AVAILABLE_TOOLS', () => {
    // gap-detector derives AVAILABLE_TOOLS = new Set(TOOL_MANIFEST).
    expect(getAvailableToolCount()).toBe(TOOL_MANIFEST.length);
  });
});
