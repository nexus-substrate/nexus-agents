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

import {
  loadManifestOverlay,
  loadUserManifestOverlay,
  resolveManifestPath,
  resolveUserManifestPath,
  MANIFEST_ENV_VAR,
  USER_MANIFEST_ENV_VAR,
} from './manifest-overlay.js';

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

  it('rejects a user overlay larger than the size cap (fails closed, #3351)', () => {
    // Build a > 1 MB file of valid-ish YAML; the size gate trips before parse.
    const big = `version: 1\nmodels:\n` + '  # padding\n'.repeat(120_000);
    const path = tempFile('oversized.yaml', big);
    const result = loadUserManifestOverlay({ path });
    expect(result.status).toBe('too-large');
    expect(result.entries).toEqual([]);
  });

  it('does not throw on malformed user overlay (fails closed, #3351)', () => {
    const path = tempFile('bad-user.yaml', 'version: 1\nmodels:\n  - id: foo\n  bad: indent');
    expect(() => loadUserManifestOverlay({ path })).not.toThrow();
    expect(loadUserManifestOverlay({ path }).status).toBe('malformed');
  });
});

// ---------------------------------------------------------------------------
// USER + OPERATOR two-path merge (#3351)
// ---------------------------------------------------------------------------

describe('resolveUserManifestPath', () => {
  it('honours NEXUS_MODEL_REGISTRY_OVERLAY when set', () => {
    const env = { [USER_MANIFEST_ENV_VAR]: '/custom/models.yaml' };
    expect(resolveUserManifestPath(env)).toBe('/custom/models.yaml');
  });

  it('falls back to <NEXUS_DATA_DIR>/models.yaml otherwise', () => {
    expect(resolveUserManifestPath({}).endsWith('models.yaml')).toBe(true);
  });
});

describe('loadManifestOverlay USER+OPERATOR merge (#3351)', () => {
  function userEntry(id: string, family: string): string {
    return `version: 1\nmodels:\n  - id: ${id}\n    vendor: anthropic\n    family: ${family}\n`;
  }

  it('user-adds-new-model: a user-only id appears in the merged entries', () => {
    const userPath = tempFile('user.yaml', userEntry('user-only-model', 'claude-opus'));
    const env = {
      [USER_MANIFEST_ENV_VAR]: userPath,
      [MANIFEST_ENV_VAR]: join(tempDir, 'absent-operator.yaml'),
    };
    const result = loadManifestOverlay({ env });
    expect(result.status).toBe('loaded');
    expect(result.entries.map((e) => e.id)).toContain('user-only-model');
  });

  it('operator-overrides-user: operator wins on an id collision', () => {
    const userPath = tempFile('user.yaml', userEntry('shared-id', 'claude-opus'));
    const operatorPath = tempFile('operator.yaml', userEntry('shared-id', 'claude-sonnet'));
    const env = {
      [USER_MANIFEST_ENV_VAR]: userPath,
      [MANIFEST_ENV_VAR]: operatorPath,
    };
    const result = loadManifestOverlay({ env });
    const shared = result.entries.find((e) => e.id === 'shared-id');
    expect(shared?.family).toBe('claude-sonnet');
  });

  it('user entry survives when the operator manifest is absent', () => {
    const userPath = tempFile('user.yaml', userEntry('only-user', 'claude-opus'));
    const env = {
      [USER_MANIFEST_ENV_VAR]: userPath,
      [MANIFEST_ENV_VAR]: join(tempDir, 'no-operator.yaml'),
    };
    const result = loadManifestOverlay({ env });
    expect(result.entries.find((e) => e.id === 'only-user')?.family).toBe('claude-opus');
  });

  it('malformed user overlay is skipped while a valid operator manifest still loads', () => {
    const userPath = tempFile('user.yaml', 'version: 1\nmodels:\n  - id: x\n  bad: indent');
    const operatorPath = tempFile('operator.yaml', userEntry('op-model', 'claude-opus'));
    const env = {
      [USER_MANIFEST_ENV_VAR]: userPath,
      [MANIFEST_ENV_VAR]: operatorPath,
    };
    const result = loadManifestOverlay({ env });
    expect(result.status).toBe('loaded');
    expect(result.entries.map((e) => e.id)).toEqual(['op-model']);
  });
});
