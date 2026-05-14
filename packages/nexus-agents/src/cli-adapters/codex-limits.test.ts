/**
 * Tests for Codex subagent-limit detection (#2659).
 *
 * @module cli-adapters/codex-limits.test
 */

import { describe, it, expect } from 'vitest';
import {
  CODEX_DEFAULT_MAX_DEPTH,
  CODEX_DEFAULT_MAX_THREADS,
  checkCodexConcurrency,
  checkCodexDepth,
} from './codex-limits.js';

describe('checkCodexConcurrency', () => {
  it('returns null at or below max_threads', () => {
    expect(checkCodexConcurrency(0)).toBeNull();
    expect(checkCodexConcurrency(CODEX_DEFAULT_MAX_THREADS)).toBeNull();
  });

  it('returns a structured warning above max_threads', () => {
    const warning = checkCodexConcurrency(CODEX_DEFAULT_MAX_THREADS + 1);
    expect(warning).not.toBeNull();
    expect(warning).toContain('max_threads');
    expect(warning).toContain(String(CODEX_DEFAULT_MAX_THREADS + 1));
    // Names the remediation, not just the problem.
    expect(warning).toContain('~/.codex/config.toml');
  });

  it('flags the default 7-voter panel on a single-CLI Codex fallback', () => {
    // The narrow real-world case: all 7 voter roles land on Codex.
    expect(checkCodexConcurrency(7)).not.toBeNull();
  });
});

describe('checkCodexDepth', () => {
  it('returns null at or below max_depth', () => {
    expect(checkCodexDepth(CODEX_DEFAULT_MAX_DEPTH)).toBeNull();
  });

  it('returns a structured warning above max_depth', () => {
    const warning = checkCodexDepth(CODEX_DEFAULT_MAX_DEPTH + 1);
    expect(warning).not.toBeNull();
    expect(warning).toContain('max_depth');
    expect(warning).toContain('~/.codex/config.toml');
  });
});
