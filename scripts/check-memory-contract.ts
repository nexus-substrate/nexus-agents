#!/usr/bin/env node
/**
 * Phase 8 of epic #2766 — drift gate enforcing the unified memory contract.
 *
 * Flags new direct `Database` / `new MobiMem()` / `outcomes.jsonl` access
 * outside the canonical files. The check is a baseline-aware lint
 * (mirrors `scripts/check-tool-distinctness.ts` and the other governance
 * gates): existing call sites are allowlisted in
 * `docs/ops/memory-contract-baseline.json`; new offenders fail CI.
 *
 * The intent is not to block every direct SQLite usage — many in-tree
 * backends still own their own files until Phase 4.1+/5.1+/6.1+/7.1
 * folds them into nexus-memory. The gate is for **new** code: PRs that
 * write to memory paths must go through `getMemoryRegistry()` or extend
 * the allowlist with an explicit comment justifying why.
 *
 * @module scripts/check-memory-contract
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SRC_ROOT = join(REPO_ROOT, 'packages/nexus-agents/src');
const BASELINE_PATH = join(REPO_ROOT, 'docs/ops/memory-contract-baseline.json');

/** Patterns that flag a direct memory write/read bypassing the contract. */
interface ProbePattern {
  readonly id: string;
  readonly regex: RegExp;
  readonly description: string;
}

const PROBES: readonly ProbePattern[] = [
  {
    id: 'better-sqlite3-direct',
    regex: /\bnew\s+Database\s*\(/,
    description: 'Direct `new Database(...)` from better-sqlite3 — use `MemoryRegistry` instead.',
  },
  {
    id: 'mobimem-direct-construct',
    regex: /\bnew\s+MobiMem\s*\(/,
    description: 'Direct `new MobiMem()` — use `getSharedMobiMem()` (#2719 fix).',
  },
  {
    id: 'outcomes-jsonl-path',
    regex: /['"`].*outcomes\.jsonl['"`]/,
    description: 'Direct string reference to `outcomes.jsonl` — go through `getOutcomeStore()`.',
  },
];

/** Per-file finding emitted by `scan`. */
export interface ContractFinding {
  readonly file: string;
  readonly line: number;
  readonly probeId: string;
  readonly snippet: string;
}

/** Baseline entry: matches `{file, probeId}`. Other fields are advisory. */
export interface BaselineEntry {
  readonly file: string;
  readonly probeId: string;
  readonly note?: string;
}

export interface Baseline {
  readonly entries: readonly BaselineEntry[];
}

const EMPTY_BASELINE: Baseline = { entries: [] };

/** Walk a directory recursively, yielding .ts files. */
function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) yield* walkTs(full);
    else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) yield full;
  }
}

/** Scan a single file for contract violations. */
export function scanFile(filePath: string): readonly ContractFinding[] {
  const findings: ContractFinding[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Skip comments — direct refs in JSDoc / inline comments are intentional context, not behavior.
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    for (const probe of PROBES) {
      if (probe.regex.test(line)) {
        findings.push({
          file: relative(REPO_ROOT, filePath),
          line: i + 1,
          probeId: probe.id,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
  return findings;
}

/** Scan the whole src/ tree. */
export function scan(): readonly ContractFinding[] {
  const all: ContractFinding[] = [];
  for (const file of walkTs(SRC_ROOT)) {
    if (file.endsWith('.test.ts')) continue;
    for (const finding of scanFile(file)) all.push(finding);
  }
  return all;
}

/** Read the baseline JSON if present, else return an empty baseline. */
export function readBaseline(path: string = BASELINE_PATH): Baseline {
  if (!existsSync(path)) return EMPTY_BASELINE;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Baseline;
  } catch {
    return EMPTY_BASELINE;
  }
}

/** Filter findings against a baseline; return only new offenders. */
export function newOffenders(
  findings: readonly ContractFinding[],
  baseline: Baseline
): readonly ContractFinding[] {
  const baselineKey = new Set(baseline.entries.map((e) => `${e.file}::${e.probeId}`));
  return findings.filter((f) => !baselineKey.has(`${f.file}::${f.probeId}`));
}

/** CLI: scan / baseline. */
async function main(): Promise<void> {
  await Promise.resolve();
  const mode = process.argv[2] ?? 'scan';

  if (mode === 'baseline') {
    const findings = scan();
    const baseline: Baseline = {
      entries: findings.map((f) => ({
        file: f.file,
        probeId: f.probeId,
        note: f.snippet,
      })),
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
    process.stdout.write(`Wrote ${String(baseline.entries.length)} entries to ${BASELINE_PATH}\n`);
    return;
  }

  const findings = scan();
  const baseline = readBaseline();
  const offenders = newOffenders(findings, baseline);

  if (offenders.length === 0) {
    process.stdout.write(
      `✅ memory contract gate: ${String(findings.length)} known sites, no new offenders\n`
    );
    return;
  }

  console.error(`❌ memory contract gate: ${String(offenders.length)} new offenders:\n`);
  for (const f of offenders) {
    const probe = PROBES.find((p) => p.id === f.probeId);
    console.error(`  ${f.file}:${String(f.line)}  [${f.probeId}]`);
    console.error(`    ${f.snippet}`);
    if (probe !== undefined) console.error(`    ${probe.description}`);
  }
  console.error('\nFix: route the access through `getMemoryRegistry()`, or extend');
  console.error(`the baseline (\`npx tsx scripts/check-memory-contract.ts baseline\`) if`);
  console.error('the direct access is intentional and justified.');
  process.exit(1);
}

// Only run when invoked directly.
const invokedDirectly = process.argv[1]?.endsWith('check-memory-contract.ts') === true;
if (invokedDirectly) {
  void main();
}
