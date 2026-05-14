#!/usr/bin/env npx tsx
/**
 * Skills Index Generator (#1828)
 *
 * Scans skills/<name>/SKILL.md files, parses YAML frontmatter, and emits
 * skills/index.yaml — a machine-readable index for non-Claude-Code agents
 * that discover via AGENTS.md → index pointer chain.
 *
 * Claude Code autoloads SKILL.md frontmatter natively and does not need
 * this index. Other CLI workers (OpenCode, Codex, Gemini CLI, Aider) use
 * the index to decide which skill to load on demand.
 *
 * Cross-vendor contract (#2660): the `name` + `description` required-field
 * validation in `parseFrontmatter` below IS the cross-vendor contract.
 * Codex's Skills primitive uses the same `SKILL.md` filename and the same
 * required frontmatter as the Anthropic Agent Skills spec, so no
 * translation layer is needed — but do not weaken that validation; it is
 * what keeps the 31 skills loadable from both Claude Code and Codex. Codex
 * discovery is documented in AGENTS.md (`.agents/skills/` or a
 * `[[skills.config]]` entry pointing at `skills/`).
 *
 * Usage:
 *   npx tsx scripts/generate-skills-index.ts          # generate
 *   npx tsx scripts/generate-skills-index.ts --check  # CI validation
 */

/* eslint-disable no-console */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { ROOT } from './script-paths.js';

const SKILLS_DIR = join(ROOT, 'skills');
const INDEX_PATH = join(SKILLS_DIR, 'index.yaml');
const CHECK_MODE = process.argv.includes('--check');

interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly 'allowed-tools'?: string;
  readonly 'argument-hint'?: string;
  readonly license?: string;
}

interface IndexEntry {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly triggers: readonly string[];
}

interface SkillsIndex {
  readonly schema_version: string;
  readonly generated_by: string;
  readonly skills: readonly IndexEntry[];
}

const SCHEMA_VERSION = '1.0';
const GENERATOR_ID = 'scripts/generate-skills-index.ts';

function parseFrontmatter(content: string, filePath: string): SkillFrontmatter {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  const body = match?.[1];
  if (body === undefined || body.length === 0) {
    throw new Error(`No YAML frontmatter found in ${filePath}`);
  }
  const parsed = parseYaml(body) as Record<string, unknown>;
  if (typeof parsed['name'] !== 'string' || typeof parsed['description'] !== 'string') {
    throw new Error(`Missing required frontmatter fields (name, description) in ${filePath}`);
  }
  return parsed as unknown as SkillFrontmatter;
}

/**
 * Normalize a trigger phrase: collapse internal whitespace runs (including
 * newlines preserved by YAML literal blocks) into single spaces, trim, and
 * lowercase. Without this, a phrase wrapped across a YAML line boundary
 * lands in the trigger set with a literal `\n` inside, which then breaks
 * the markdown table emitted by inject-governance.ts (MD038 + MD056).
 */
function normalizeTrigger(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function addQuotedTriggers(description: string, triggers: Set<string>): void {
  for (const m of description.matchAll(/"([^"]+)"/g)) {
    if (m[1] !== undefined) {
      const normalized = normalizeTrigger(m[1]);
      if (normalized.length > 0) triggers.add(normalized);
    }
  }
}

function addUseWhenTrigger(description: string, triggers: Set<string>): void {
  const match = /use when ([^.]+?)(?:[.,]|$)/i.exec(description)?.[1];
  if (match !== undefined && match.length > 0) {
    const normalized = normalizeTrigger(match);
    if (normalized.length > 0) triggers.add(normalized);
  }
}

function addTriggersOnList(description: string, triggers: Set<string>): void {
  const match = /triggers? on ([^.]+)/i.exec(description)?.[1];
  if (match === undefined || match.length === 0) return;
  for (const t of match.replace(/["']/g, '').split(/,|\bor\b/)) {
    const normalized = normalizeTrigger(t);
    if (normalized.length > 0) triggers.add(normalized);
  }
}

function extractTriggers(description: string): string[] {
  const triggers = new Set<string>();
  addQuotedTriggers(description, triggers);
  addUseWhenTrigger(description, triggers);
  addTriggersOnList(description, triggers);
  return [...triggers].filter((t) => t.length > 1 && t.length < 80);
}

function scanSkills(): IndexEntry[] {
  if (!existsSync(SKILLS_DIR)) {
    throw new Error(`Skills directory not found: ${SKILLS_DIR}`);
  }
  const entries: IndexEntry[] = [];
  for (const name of readdirSync(SKILLS_DIR).sort()) {
    const skillDir = join(SKILLS_DIR, name);
    if (!statSync(skillDir).isDirectory()) continue;
    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const content = readFileSync(skillFile, 'utf-8');
    const fm = parseFrontmatter(content, skillFile);
    entries.push({
      name: fm.name,
      description: fm.description.trim(),
      path: relative(ROOT, skillFile),
      triggers: extractTriggers(fm.description),
    });
  }
  return entries;
}

function buildIndex(): SkillsIndex {
  return {
    schema_version: SCHEMA_VERSION,
    generated_by: GENERATOR_ID,
    skills: scanSkills(),
  };
}

function main(): void {
  const index = buildIndex();
  const yaml = stringifyYaml(index, { lineWidth: 100 });

  if (CHECK_MODE) {
    if (!existsSync(INDEX_PATH)) {
      console.error(`❌ ${INDEX_PATH} does not exist. Run: npx tsx ${GENERATOR_ID}`);
      process.exit(1);
    }
    const current = readFileSync(INDEX_PATH, 'utf-8');
    if (current !== yaml) {
      console.error('❌ skills/index.yaml is stale.');
      console.error(`   Run: npx tsx ${GENERATOR_ID}`);
      process.exit(1);
    }
    console.log(`✅ skills/index.yaml is up to date (${String(index.skills.length)} skills)`);
    return;
  }

  writeFileSync(INDEX_PATH, yaml, 'utf-8');
  console.log(`✅ Wrote ${INDEX_PATH} (${String(index.skills.length)} skills)`);
}

main();
