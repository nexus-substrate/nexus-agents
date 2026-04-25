/**
 * Tests for the YAML overlay loader (epic #2174 / issue #2178).
 *
 * Fully offline — every test writes a fixture file into a temp dir and
 * points the loader at it. No real home directory access.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ILogger } from '../core/index.js';
import {
  OVERLAY_ENV_VAR,
  OVERLAY_MAX_BYTES,
  defaultOverlayPath,
  loadCapabilityOverlay,
  resolveOverlayPath,
} from './capability-overlay.js';

function silentLogger(): ILogger {
  const spy = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  spy.child.mockReturnValue(spy);
  return spy;
}

let tempDir: string;
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'overlay-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

describe('resolveOverlayPath', () => {
  it('uses the env-var override when set', () => {
    const resolved = resolveOverlayPath({ [OVERLAY_ENV_VAR]: '/custom/path.yaml' });
    expect(resolved).toBe('/custom/path.yaml');
  });

  it('falls back to the default location when env is unset', () => {
    const resolved = resolveOverlayPath({});
    expect(resolved).toBe(defaultOverlayPath());
  });

  it('treats empty env value as unset', () => {
    const resolved = resolveOverlayPath({ [OVERLAY_ENV_VAR]: '' });
    expect(resolved).toBe(defaultOverlayPath());
  });
});

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

describe('loadCapabilityOverlay — missing / empty files', () => {
  it('returns empty entries for a missing file (no throw)', () => {
    const result = loadCapabilityOverlay(join(tempDir, 'missing.yaml'), silentLogger());
    expect(result.status).toBe('missing');
    expect(result.entries).toHaveLength(0);
    expect(result.rejections).toHaveLength(0);
  });

  it('returns empty entries for an empty file', () => {
    const path = join(tempDir, 'empty.yaml');
    writeFileSync(path, '', 'utf-8');
    const result = loadCapabilityOverlay(path, silentLogger());
    expect(result.status).toBe('empty');
    expect(result.entries).toHaveLength(0);
  });

  it('returns empty entries for a whitespace-only file', () => {
    const path = join(tempDir, 'whitespace.yaml');
    writeFileSync(path, '\n   \n\t\n', 'utf-8');
    const result = loadCapabilityOverlay(path, silentLogger());
    expect(result.status).toBe('empty');
  });
});

describe('loadCapabilityOverlay — malformed files', () => {
  it('returns empty entries + structured rejection on YAML parse error', () => {
    const path = join(tempDir, 'bad.yaml');
    writeFileSync(path, 'this: is: not: valid: yaml: {[}', 'utf-8');
    const result = loadCapabilityOverlay(path, silentLogger());
    expect(result.status).toBe('malformed');
    expect(result.entries).toHaveLength(0);
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]!.reason).toMatch(/YAML parse error/);
  });

  it('returns empty when the YAML is a scalar instead of an array / object', () => {
    const path = join(tempDir, 'scalar.yaml');
    writeFileSync(path, '"just a string"', 'utf-8');
    const result = loadCapabilityOverlay(path, silentLogger());
    expect(result.status).toBe('malformed');
    expect(result.rejections).toHaveLength(1);
  });

  it('refuses to load files that exceed the size cap', () => {
    const path = join(tempDir, 'huge.yaml');
    const big = 'a'.repeat(OVERLAY_MAX_BYTES + 1024);
    writeFileSync(path, big, 'utf-8');
    const result = loadCapabilityOverlay(path, silentLogger());
    expect(result.status).toBe('too-large');
    expect(result.rejections[0]!.reason).toMatch(/size .* exceeds cap/);
  });

  it('does not throw when path resolves to a directory (fs-error fail-closed)', () => {
    // existsSync(dir) is true and statSync(dir) succeeds, but readFileSync
    // throws EISDIR. Loader docstring promises no throws on fs errors.
    const result = loadCapabilityOverlay(tempDir, silentLogger());
    expect(result.status).toBe('malformed');
    expect(result.entries).toHaveLength(0);
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]!.reason).toMatch(/file read|EISDIR|illegal/i);
  });
});

// ---------------------------------------------------------------------------
// Valid shapes
// ---------------------------------------------------------------------------

describe('loadCapabilityOverlay — valid shapes', () => {
  const validClaudeEntry = `
    id: claude-opus
    displayName: "Claude Opus — override"
    provider: anthropic
    contextWindow: 2000000
    outputModalities: ['text']
    inputModalities: ['text']
    toolCapabilities: []
    specialFeatures: []
  `;

  it('accepts a top-level array of entries', () => {
    const path = join(tempDir, 'array.yaml');
    writeFileSync(path, `- ${validClaudeEntry.trim().replace(/\n\s*/g, '\n  ')}`, 'utf-8');
    const result = loadCapabilityOverlay(path, silentLogger());
    expect(result.status).toBe('loaded');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.id).toBe('claude-opus');
    expect(result.entries[0]!.contextWindow).toBe(2_000_000);
  });

  it('accepts a { models: [...] } top-level object', () => {
    const path = join(tempDir, 'nested.yaml');
    writeFileSync(
      path,
      `version: 1\nmodels:\n  - ${validClaudeEntry.trim().replace(/\n\s*/g, '\n    ')}`,
      'utf-8'
    );
    const result = loadCapabilityOverlay(path, silentLogger());
    expect(result.status).toBe('loaded');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.displayName).toBe('Claude Opus — override');
  });

  it('skips invalid entries and keeps valid ones (partial acceptance)', () => {
    const path = join(tempDir, 'partial.yaml');
    writeFileSync(
      path,
      [
        '- ' + validClaudeEntry.trim().replace(/\n\s*/g, '\n  '),
        // Missing id + provider etc. — will be rejected
        '- displayName: "broken"',
      ].join('\n'),
      'utf-8'
    );
    const result = loadCapabilityOverlay(path, silentLogger());
    expect(result.status).toBe('loaded');
    expect(result.entries).toHaveLength(1);
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]!.index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Env-var override path
// ---------------------------------------------------------------------------

describe('loadCapabilityOverlay — env-var override', () => {
  it('honors env when passed an env object instead of a path string', () => {
    const path = join(tempDir, 'via-env.yaml');
    writeFileSync(path, '', 'utf-8');
    const result = loadCapabilityOverlay({ [OVERLAY_ENV_VAR]: path }, silentLogger());
    expect(result.path).toBe(path);
    expect(result.status).toBe('empty');
  });
});
