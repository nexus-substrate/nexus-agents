/**
 * Tests for agents-index generator (#1825 follow-up).
 *
 * Locks the gap-coverage invariant: every BUILT_IN_EXPERTS entry must
 * have a corresponding agents/<name>-expert.md file.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = join(__dirname, '..');
const INDEX_PATH = join(ROOT, 'agents', 'index.yaml');
const EXPERT_CONFIG = join(ROOT, 'packages/nexus-agents/src/agents/experts/expert-config.ts');

interface IndexEntry {
  name: string;
  description: string;
  path: string;
}

interface AgentsIndex {
  schema_version: string;
  generated_by: string;
  agents: IndexEntry[];
}

function loadIndex(): AgentsIndex {
  return parseYaml(readFileSync(INDEX_PATH, 'utf-8')) as AgentsIndex;
}

function extractExpertKeys(): string[] {
  const src = readFileSync(EXPERT_CONFIG, 'utf-8');
  const builtInStart = src.indexOf('BUILT_IN_EXPERTS');
  const region = src.slice(builtInStart);
  const keys: string[] = [];
  const re = /^\s{2}'?([a-z][a-z-]*)'?:\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region)) !== null) {
    if (m[1] !== undefined) keys.push(m[1]);
  }
  return [...new Set(keys)];
}

describe('agents/index.yaml', () => {
  it('exists and parses as YAML', () => {
    expect(existsSync(INDEX_PATH)).toBe(true);
    expect(() => loadIndex()).not.toThrow();
  });

  it('has schema_version 1.0 + correct generator id', () => {
    const index = loadIndex();
    expect(index.schema_version).toBe('1.0');
    expect(index.generated_by).toBe('scripts/generate-agents-index.ts');
  });

  it('every agent entry points to an existing agents/*.md file', () => {
    const index = loadIndex();
    expect(index.agents.length).toBeGreaterThan(0);
    for (const entry of index.agents) {
      expect(entry.path).toMatch(/^agents\/[^/]+\.md$/);
      expect(existsSync(join(ROOT, entry.path))).toBe(true);
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  it('agent names are unique', () => {
    const index = loadIndex();
    const names = index.agents.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gap-coverage: every BUILT_IN_EXPERTS entry has an agents/<name>-expert.md', () => {
    const expertKeys = extractExpertKeys();
    const index = loadIndex();
    const agentNames = new Set(index.agents.map((a) => a.name));
    const missing = expertKeys.filter((k) => !agentNames.has(`${k}-expert`));
    expect(missing, `Missing agent files: ${missing.join(', ')}`).toEqual([]);
  });
});
