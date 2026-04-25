/**
 * Tests for shared CLI binary detection helpers (#2155).
 *
 * Pure-function tests for `extractSemver` + `getCliLocatorCommand`. The
 * `detectCliBinary` integration is exercised through each existing
 * `setup-*.test.ts` (codex, gemini, opencode) so we don't duplicate the
 * fs/process mocking here.
 *
 * @module cli/setup-cli-detection.test
 */

import { describe, it, expect, vi } from 'vitest';

import { extractSemver, getCliLocatorCommand, detectCliBinary } from './setup-cli-detection.js';

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, platform: vi.fn(() => actual.platform()) };
});

import { platform } from 'node:os';

describe('extractSemver', () => {
  it('extracts X.Y.Z from a typical CLI version banner', () => {
    expect(extractSemver('claude version 1.2.3')).toBe('1.2.3');
    expect(extractSemver('gemini-cli/0.7.12')).toBe('0.7.12');
  });

  it('extracts the first match when multiple semvers appear', () => {
    expect(extractSemver('codex 1.0.0 (build 2.4.7)')).toBe('1.0.0');
  });

  it('returns undefined when no semver is present', () => {
    expect(extractSemver('opencode')).toBeUndefined();
    expect(extractSemver('1.2')).toBeUndefined(); // partial — no third segment
    expect(extractSemver('')).toBeUndefined();
  });

  it('handles multi-digit segments', () => {
    expect(extractSemver('v12.345.6789')).toBe('12.345.6789');
  });
});

describe('getCliLocatorCommand', () => {
  it("returns 'which' on POSIX platforms", () => {
    vi.mocked(platform).mockReturnValueOnce('linux');
    expect(getCliLocatorCommand()).toBe('which');
  });

  it("returns 'which' on macOS", () => {
    vi.mocked(platform).mockReturnValueOnce('darwin');
    expect(getCliLocatorCommand()).toBe('which');
  });

  it("returns 'where' on Windows", () => {
    vi.mocked(platform).mockReturnValueOnce('win32');
    expect(getCliLocatorCommand()).toBe('where');
  });
});

describe('detectCliBinary', () => {
  it('returns installed=false when the binary is not on PATH', () => {
    // 'definitely-not-a-real-cli-binary-xyz' should not exist; the locator
    // call fails, returning installed:false with a classified error.
    const result = detectCliBinary('definitely-not-a-real-cli-binary-xyz');
    expect(result.installed).toBe(false);
    expect(result.version).toBeUndefined();
    expect(result.detectionError).toBeDefined();
  });
});
