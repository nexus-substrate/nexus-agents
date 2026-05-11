/**
 * Tests for manifest-overlay (#2547 4a).
 *
 * The loader must never throw — missing files, empty files, malformed
 * YAML/JSON, and schema-invalid entries all degrade gracefully.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadManifestOverlay, resolveManifestPath, MANIFEST_ENV_VAR } from './manifest-overlay.js';

let tempDir: string;
function tempFile(name: string, content: string): string {
  const path = join(tempDir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'manifest-overlay-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('resolveManifestPath', () => {
  it('honours NEXUS_MODELS_OVERLAY_PATH when set', () => {
    const env = { [MANIFEST_ENV_VAR]: '/custom/path/manifest.yaml' };
    expect(resolveManifestPath(env)).toBe('/custom/path/manifest.yaml');
  });

  it('falls back to <NEXUS_DATA_DIR>/models-manifest.yaml otherwise', () => {
    // The exact path depends on NEXUS_DATA_DIR; just verify the filename component.
    const p = resolveManifestPath({});
    expect(p.endsWith('models-manifest.yaml')).toBe(true);
  });
});

describe('loadManifestOverlay', () => {
  it('returns missing status when the file does not exist', () => {
    const result = loadManifestOverlay({ path: join(tempDir, 'absent.yaml') });
    expect(result.status).toBe('missing');
    expect(result.entries).toEqual([]);
    expect(result.rejections).toEqual([]);
  });

  it('returns empty status when the file is zero bytes', () => {
    const path = tempFile('empty.yaml', '');
    const result = loadManifestOverlay({ path });
    expect(result.status).toBe('empty');
  });

  it('returns malformed status on broken YAML', () => {
    const path = tempFile('broken.yaml', 'version: 1\nmodels:\n  - id: foo\n  bad: indent');
    const result = loadManifestOverlay({ path });
    expect(result.status).toBe('malformed');
  });

  it('loads a minimum-viable entry (id + vendor + family) with defaults', () => {
    const path = tempFile(
      'minimal.yaml',
      `version: 1
models:
  - id: my-custom-model
    vendor: anthropic
    family: claude-opus
`
    );
    const result = loadManifestOverlay({ path });
    expect(result.status).toBe('loaded');
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0]!;
    expect(entry.id).toBe('my-custom-model');
    expect(entry.vendor).toBe('anthropic');
    expect(entry.family).toBe('claude-opus');
    expect(entry.source).toBe('manifest');
    // Behaviour defaults kicked in
    expect(entry.parallelToolCalls).toBe(false);
    expect(entry.promptCaching).toBe('none');
    expect(entry.toolDefinitionFormat).toBe('openai');
    expect(entry.maxRecommendedTurnBudget).toBe(10);
    expect(entry.strictJson).toBe(true);
    expect(entry.quirks).toEqual([]);
    expect(entry.profileId).toBe('manifest-anthropic');
  });

  it('honours operator-supplied behaviour overrides', () => {
    const path = tempFile(
      'overrides.yaml',
      `version: 1
models:
  - id: claude-custom
    vendor: anthropic
    family: claude-opus
    parallelToolCalls: true
    promptCaching: ephemeral
    toolDefinitionFormat: anthropic
    maxRecommendedTurnBudget: 25
    strictJson: false
    quirks: [dated]
    profileId: anthropic-tuned
`
    );
    const result = loadManifestOverlay({ path });
    const entry = result.entries[0]!;
    expect(entry.parallelToolCalls).toBe(true);
    expect(entry.promptCaching).toBe('ephemeral');
    expect(entry.toolDefinitionFormat).toBe('anthropic');
    expect(entry.maxRecommendedTurnBudget).toBe(25);
    expect(entry.strictJson).toBe(false);
    expect(entry.quirks).toEqual(['dated']);
    expect(entry.profileId).toBe('anthropic-tuned');
  });

  it('records rejections for schema-invalid entries while keeping valid ones', () => {
    const path = tempFile(
      'mixed.yaml',
      `version: 1
models:
  - id: ok-model
    vendor: anthropic
    family: claude-opus
  - id: missing-family
    vendor: anthropic
  - id: bad-vendor
    vendor: not-a-real-vendor
    family: foo
`
    );
    const result = loadManifestOverlay({ path });
    expect(result.status).toBe('loaded');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.id).toBe('ok-model');
    expect(result.rejections).toHaveLength(2);
    expect(result.rejections[0]!.id).toBe('missing-family');
    expect(result.rejections[1]!.id).toBe('bad-vendor');
  });

  it('accepts JSON manifests as well as YAML', () => {
    const path = tempFile(
      'manifest.json',
      JSON.stringify({
        version: 1,
        models: [{ id: 'json-model', vendor: 'openai', family: 'gpt-4o' }],
      })
    );
    const result = loadManifestOverlay({ path });
    expect(result.status).toBe('loaded');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.vendor).toBe('openai');
  });

  it('rejects manifest without `version: 1`', () => {
    const path = tempFile(
      'no-version.yaml',
      `models:
  - id: foo
    vendor: anthropic
    family: claude-opus
`
    );
    const result = loadManifestOverlay({ path });
    expect(result.status).toBe('malformed');
  });
});
