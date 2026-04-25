/**
 * Tests for setup config generation (#1252).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runConfigInitSync } from './setup-config.js';

describe('runConfigInitSync (#1252)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `nexus-config-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('creates nexus-agents.yaml in fresh directory', () => {
    const result = runConfigInitSync(testDir, false, false);
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(existsSync(join(testDir, 'nexus-agents.yaml'))).toBe(true);
    const content = readFileSync(join(testDir, 'nexus-agents.yaml'), 'utf-8');
    expect(content).toContain('models:');
    expect(content).toContain('experts:');
  });

  it('skips if config already exists', () => {
    writeFileSync(join(testDir, 'nexus-agents.yaml'), 'existing: true', 'utf-8');
    const result = runConfigInitSync(testDir, false, false);
    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(result.message).toContain('already exists');
    // Original content preserved
    const content = readFileSync(join(testDir, 'nexus-agents.yaml'), 'utf-8');
    expect(content).toBe('existing: true');
  });

  it('overwrites with --force', () => {
    writeFileSync(join(testDir, 'nexus-agents.yaml'), 'existing: true', 'utf-8');
    const result = runConfigInitSync(testDir, true, false);
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    const content = readFileSync(join(testDir, 'nexus-agents.yaml'), 'utf-8');
    expect(content).toContain('models:');
  });

  it('reports without writing in dry-run mode', () => {
    const result = runConfigInitSync(testDir, false, true);
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.message).toContain('Would create');
    expect(existsSync(join(testDir, 'nexus-agents.yaml'))).toBe(false);
  });

  // #2183 — silent data loss bug: --force replaced 100+ lines of customization
  // with a 12-line template. Fix: write a backup before overwriting and surface
  // the backup path in the result message.
  describe('--force backup safety (#2183)', () => {
    it('writes a timestamped backup before overwriting', () => {
      const original = '# user customization\nsecurity:\n  blockedPatterns:\n    - .env*\n';
      writeFileSync(join(testDir, 'nexus-agents.yaml'), original, 'utf-8');

      const result = runConfigInitSync(testDir, true, false);

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      // Backup exists alongside the new file
      const entries = readdirSync(testDir);
      const backup = entries.find(
        (n) => n.startsWith('nexus-agents.yaml.bak.') && !n.endsWith('.tmp')
      );
      expect(backup).toBeDefined();
      // Backup contents match the original file byte-for-byte
      if (backup !== undefined) {
        expect(readFileSync(join(testDir, backup), 'utf-8')).toBe(original);
      }
    });

    it('surfaces the backup path in the result message', () => {
      writeFileSync(join(testDir, 'nexus-agents.yaml'), 'existing: true', 'utf-8');

      const result = runConfigInitSync(testDir, true, false);

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/backup.*nexus-agents\.yaml\.bak/);
    });

    it('does NOT create a backup when no existing file is present', () => {
      const result = runConfigInitSync(testDir, true, false);

      expect(result.success).toBe(true);
      const entries = readdirSync(testDir);
      const backupCount = entries.filter((n) => n.startsWith('nexus-agents.yaml.bak.')).length;
      expect(backupCount).toBe(0);
    });

    it('does NOT create a backup in dry-run mode even with --force + existing file', () => {
      writeFileSync(join(testDir, 'nexus-agents.yaml'), 'existing: true', 'utf-8');

      const result = runConfigInitSync(testDir, true, true);

      expect(result.success).toBe(true);
      // No new files written; original remains intact, no backup created
      expect(readFileSync(join(testDir, 'nexus-agents.yaml'), 'utf-8')).toBe('existing: true');
      const entries = readdirSync(testDir);
      const backupCount = entries.filter((n) => n.startsWith('nexus-agents.yaml.bak.')).length;
      expect(backupCount).toBe(0);
    });
  });
});
