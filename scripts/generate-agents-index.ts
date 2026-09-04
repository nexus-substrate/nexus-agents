/**
 * Agents Index Generator (#1825 follow-up)
 *
 * Scans agents/*.md files, parses YAML frontmatter, and emits
 * agents/index.yaml — a machine-readable index for non-Claude agents
 * to discover available expert prompts on demand.
 *
 * Claude Code autoloads agents/*.md natively via /agents and does not
 * need this index. Other CLI workers (OpenCode, Codex, Gemini CLI,
 * Aider) consult the index via AGENTS.md.
 *
 * Gap-coverage invariant: `agents/` must mirror every entry in
 * BUILT_IN_EXPERTS (BuiltInExpertType). --check fails if an expert
 * is missing its agent file.
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-agents-index.ts          # generate
 *   pnpm exec tsx scripts/generate-agents-index.ts --check  # CI validation
 */

/* eslint-disable no-console */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { ROOT } from './script-paths.js';

const AGENTS_DIR = join(ROOT, 'agents');
const INDEX_PATH = join(AGENTS_DIR, 'index.yaml');
const EXPERT_CONFIG = join(ROOT, 'packages/nexus-agents/src/agents/experts/expert-config.ts');
const CHECK_MODE = process.argv.includes('--check');

interface AgentFrontmatter {
  readonly name: string;
  readonly description: string;
}

interface IndexEntry {
  readonly name: string;
  readonly description: string;
  readonly path: string;
}

interface AgentsIndex {
  readonly schema_version: string;
  readonly generated_by: string;
  readonly agents: readonly IndexEntry[];
}

const SCHEMA_VERSION = '1.0';
const GENERATOR_ID = 'scripts/generate-agents-index.ts';

function parseFrontmatter(content: string, filePath: string): AgentFrontmatter {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  const body = match?.[1];
  if (body === undefined || body.length === 0) {
    throw new Error(`No YAML frontmatter in ${filePath}`);
  }
  const parsed = parseYaml(body) as Record<string, unknown>;
  if (typeof parsed['name'] !== 'string' || typeof parsed['description'] !== 'string') {
    throw new Error(`Missing required frontmatter (name, description) in ${filePath}`);
  }
  return parsed as unknown as AgentFrontmatter;
}

function scanAgents(): IndexEntry[] {
  if (!existsSync(AGENTS_DIR)) {
    throw new Error(`Agents directory not found: ${AGENTS_DIR}`);
  }
  const entries: IndexEntry[] = [];
  for (const file of readdirSync(AGENTS_DIR).sort()) {
    if (!file.endsWith('.md')) continue;
    const filePath = join(AGENTS_DIR, file);
    const content = readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content, filePath);
    entries.push({
      name: fm.name,
      description: fm.description.trim(),
      path: relative(ROOT, filePath),
    });
  }
  return entries;
}

/** Extract BuiltInExpertType keys from expert-config.ts source. */
function extractExpertKeys(): string[] {
  const src = readFileSync(EXPERT_CONFIG, 'utf-8');
  const builtInStart = src.indexOf('BUILT_IN_EXPERTS');
  if (builtInStart === -1) return [];
  const region = src.slice(builtInStart);
  const keys: string[] = [];
  const re = /^\s{2}'?([a-z][a-z-]*)'?:\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region)) !== null) {
    if (m[1] !== undefined) keys.push(m[1]);
  }
  return [...new Set(keys)];
}

/** Verify every expert in BUILT_IN_EXPERTS has a corresponding agent file. */
function checkGapCoverage(entries: readonly IndexEntry[]): string[] {
  const expertKeys = extractExpertKeys();
  const agentNames = new Set(entries.map((e) => e.name));
  const missing: string[] = [];
  for (const key of expertKeys) {
    const expected = `${key}-expert`;
    if (!agentNames.has(expected)) missing.push(expected);
  }
  return missing;
}

function buildIndex(): AgentsIndex {
  return {
    schema_version: SCHEMA_VERSION,
    generated_by: GENERATOR_ID,
    agents: scanAgents(),
  };
}

function main(): void {
  const index = buildIndex();
  const missing = checkGapCoverage(index.agents);
  if (missing.length > 0) {
    console.error(`❌ Missing agent files for experts: ${missing.join(', ')}`);
    console.error(`   Create agents/<name>.md for each missing expert.`);
    process.exit(1);
  }

  const yaml = stringifyYaml(index, { lineWidth: 100 });

  if (CHECK_MODE) {
    if (!existsSync(INDEX_PATH)) {
      console.error(`❌ ${INDEX_PATH} does not exist. Run: pnpm exec tsx ${GENERATOR_ID}`);
      process.exit(1);
    }
    const current = readFileSync(INDEX_PATH, 'utf-8');
    if (current !== yaml) {
      console.error('❌ agents/index.yaml is stale.');
      console.error(`   Run: pnpm exec tsx ${GENERATOR_ID}`);
      process.exit(1);
    }
    console.log(`✅ agents/index.yaml is up to date (${String(index.agents.length)} agents)`);
    return;
  }

  writeFileSync(INDEX_PATH, yaml, 'utf-8');
  console.log(`✅ Wrote ${INDEX_PATH} (${String(index.agents.length)} agents)`);
}

if (process.argv[1]?.endsWith('generate-agents-index.ts') === true) {
  main();
}
