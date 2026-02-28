/**
 * Tests for setup config generation (#1252).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
});
