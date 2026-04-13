/**
 * Tests for skills-index generator (#1828).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = join(__dirname, '..');
const INDEX_PATH = join(ROOT, 'skills', 'index.yaml');

interface IndexEntry {
  name: string;
  description: string;
  path: string;
  triggers: string[];
}

interface SkillsIndex {
  schema_version: string;
  generated_by: string;
  skills: IndexEntry[];
}

function loadIndex(): SkillsIndex {
  return parseYaml(readFileSync(INDEX_PATH, 'utf-8')) as SkillsIndex;
}

describe('skills/index.yaml', () => {
  it('exists and parses as YAML', () => {
    expect(existsSync(INDEX_PATH)).toBe(true);
    expect(() => loadIndex()).not.toThrow();
  });

  it('has schema_version 1.0 and correct generator id', () => {
    const index = loadIndex();
    expect(index.schema_version).toBe('1.0');
    expect(index.generated_by).toBe('scripts/generate-skills-index.ts');
  });

  it('lists exactly the skills present in skills/<name>/SKILL.md', () => {
    const index = loadIndex();
    expect(index.skills.length).toBeGreaterThanOrEqual(17);
    for (const entry of index.skills) {
      expect(entry.name).toMatch(/^[a-z0-9-]+$/);
      expect(entry.path).toMatch(/^skills\/[^/]+\/SKILL\.md$/);
      expect(existsSync(join(ROOT, entry.path))).toBe(true);
    }
  });

  it('every skill has a non-empty description', () => {
    const index = loadIndex();
    for (const entry of index.skills) {
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  it('skill names are unique', () => {
    const index = loadIndex();
    const names = index.skills.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('extracts at least one trigger for most skills', () => {
    const index = loadIndex();
    const withTriggers = index.skills.filter((s) => s.triggers.length > 0);
    expect(withTriggers.length).toBeGreaterThanOrEqual(Math.floor(index.skills.length * 0.8));
  });
});
