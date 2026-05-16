/**
 * Tests for the doctor harness-alignment sub-check (Phase 3 of #2805).
 *
 * @module cli/doctor-harness-alignment.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkHarnessAlignment } from './doctor-harness-alignment.js';

describe('checkHarnessAlignment', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'doctor-harness-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeAt(rel: string, content: string): void {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }

  it('reports agentsMdExists=false when AGENTS.md is missing', () => {
    const check = checkHarnessAlignment(root);
    expect(check.agentsMdExists).toBe(false);
  });

  it('reports agentsMdExists=true when AGENTS.md is present', () => {
    writeAt('AGENTS.md', '# AGENTS.md');
    const check = checkHarnessAlignment(root);
    expect(check.agentsMdExists).toBe(true);
  });

  it('marks a harness as aligned when its file mentions AGENTS.md', () => {
    writeAt('.cursor/rules/agents.mdc', '---\nalwaysApply: true\n---\nSee AGENTS.md.');
    const check = checkHarnessAlignment(root);
    const cursor = check.files.find((f) => f.harness === 'Cursor');
    expect(cursor?.exists).toBe(true);
    expect(cursor?.redirectsToAgentsMd).toBe(true);
    expect(check.alignedCount).toBeGreaterThanOrEqual(1);
  });

  it('marks a harness as drift when the file exists but does not mention AGENTS.md', () => {
    writeAt('.windsurf/rules/agents.md', '# Windsurf rules\n\nSome custom content here.');
    const check = checkHarnessAlignment(root);
    const windsurf = check.files.find((f) => f.harness === 'Windsurf');
    expect(windsurf?.exists).toBe(true);
    expect(windsurf?.redirectsToAgentsMd).toBe(false);
    expect(check.driftCount).toBeGreaterThanOrEqual(1);
  });

  it('marks a harness as missing when its file is absent', () => {
    const check = checkHarnessAlignment(root);
    const aider = check.files.find((f) => f.harness === 'Aider');
    expect(aider?.exists).toBe(false);
    expect(aider?.redirectsToAgentsMd).toBe(false);
    expect(check.missingCount).toBeGreaterThanOrEqual(1);
  });

  it('aggregates counts across all 5 known harnesses', () => {
    writeAt('AGENTS.md', '# AGENTS.md');
    writeAt('.cursor/rules/agents.mdc', 'See AGENTS.md');
    writeAt('.windsurf/rules/agents.md', 'See AGENTS.md');
    writeAt('.aider.conf.yml', 'read: [AGENTS.md]');
    writeAt('.continue/rules/agents.md', 'See AGENTS.md');
    writeAt('.clinerules/agents.md', 'See AGENTS.md');

    const check = checkHarnessAlignment(root);

    expect(check.files).toHaveLength(5);
    expect(check.alignedCount).toBe(5);
    expect(check.driftCount).toBe(0);
    expect(check.missingCount).toBe(0);
  });

  it('handles mixed alignment + drift + missing in one tree', () => {
    writeAt('.cursor/rules/agents.mdc', 'See AGENTS.md'); // aligned
    writeAt('.windsurf/rules/agents.md', 'Some unrelated content'); // drift
    // Aider, Continue, Cline absent → missing

    const check = checkHarnessAlignment(root);
    expect(check.alignedCount).toBe(1);
    expect(check.driftCount).toBe(1);
    expect(check.missingCount).toBe(3);
  });

  it('does not throw on unreadable files (filesystem race)', () => {
    expect(() => checkHarnessAlignment('/proc/self/nonexistent')).not.toThrow();
  });
});
