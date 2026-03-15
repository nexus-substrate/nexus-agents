#!/usr/bin/env npx tsx
/**
 * Model Registry Probe Script
 *
 * Probes provider APIs and CLI tools to detect model registry drift.
 * Compares discovered models against DEFAULT_MODEL_CAPABILITIES and
 * outputs a structured report of new, removed, or changed models.
 *
 * Usage:
 *   npx tsx scripts/probe-models.ts          # probe all sources, report drift
 *   npx tsx scripts/probe-models.ts --json   # output as JSON
 *
 * Environment variables (optional — sources are skipped when missing):
 *   ANTHROPIC_API_KEY   — probe Anthropic /v1/models
 *   GOOGLE_AI_API_KEY   — probe Google AI /v1beta/models
 *   OPENAI_API_KEY      — probe OpenAI /v1/models
 *
 * @module scripts/probe-models
 * (Source: Issue #1554)
 */

/* eslint-disable no-console */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProbeResult {
  source: string;
  models: string[];
  error?: string;
}

interface DriftReport {
  registryModels: string[];
  probed: ProbeResult[];
  newInApis: string[];
  missingFromApis: string[];
  registryAge: number;
  stale: boolean;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Registry Reader
// ---------------------------------------------------------------------------

function readRegistryModelIds(): { ids: string[]; updatedAt: string } {
  const capPath = join(ROOT, 'packages/nexus-agents/src/config/model-capabilities.ts');
  const content = readFileSync(capPath, 'utf-8');

  const ids: string[] = [];
  for (const match of content.matchAll(/id:\s*'([^']+)'/g)) {
    if (match[1] !== undefined && match[1] !== '') ids.push(match[1]);
  }

  const updatedMatch = content.match(/updatedAt:\s*'([^']+)'/);
  const updatedAt = updatedMatch?.[1] ?? 'unknown';

  return { ids, updatedAt };
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

async function probeAnthropic(): Promise<ProbeResult> {
  const key = process.env['ANTHROPIC_API_KEY'] ?? '';
  if (key === '')
    return { source: 'anthropic-api', models: [], error: 'ANTHROPIC_API_KEY not set' };

  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok)
      return { source: 'anthropic-api', models: [], error: `HTTP ${String(res.status)}` };
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const models = (data.data ?? []).map((m) => m.id);
    return { source: 'anthropic-api', models };
  } catch (err) {
    return { source: 'anthropic-api', models: [], error: String(err) };
  }
}

async function probeGoogle(): Promise<ProbeResult> {
  const key = process.env['GOOGLE_AI_API_KEY'] ?? '';
  if (key === '') return { source: 'google-api', models: [], error: 'GOOGLE_AI_API_KEY not set' };

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!res.ok) return { source: 'google-api', models: [], error: `HTTP ${String(res.status)}` };
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const models = (data.models ?? []).map((m) => m.name.replace('models/', ''));
    return { source: 'google-api', models };
  } catch (err) {
    return { source: 'google-api', models: [], error: String(err) };
  }
}

async function probeOpenAI(): Promise<ProbeResult> {
  const key = process.env['OPENAI_API_KEY'] ?? '';
  if (key === '') return { source: 'openai-api', models: [], error: 'OPENAI_API_KEY not set' };

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { source: 'openai-api', models: [], error: `HTTP ${String(res.status)}` };
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const models = (data.data ?? []).map((m) => m.id).sort();
    return { source: 'openai-api', models };
  } catch (err) {
    return { source: 'openai-api', models: [], error: String(err) };
  }
}

async function probeOpenCode(): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileAsync('opencode', ['models'], { timeout: 10000 });
    const models = stdout
      .trim()
      .split('\n')
      .filter((l) => l.trim().length > 0);
    return { source: 'opencode-cli', models };
  } catch (err) {
    return { source: 'opencode-cli', models: [], error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Diff Logic
// ---------------------------------------------------------------------------

function computeDrift(registryIds: string[], probed: ProbeResult[]): DriftReport {
  const registry = readRegistryModelIds();
  const ageDays = Math.floor(
    (Date.now() - new Date(registry.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Collect all discovered model IDs across all sources
  const allDiscovered = new Set<string>();
  for (const p of probed) {
    if (p.error !== undefined) continue;
    for (const m of p.models) allDiscovered.add(m);
  }

  // Models in APIs but not in registry
  const registrySet = new Set(registryIds);
  const newInApis = [...allDiscovered].filter((m) => !registrySet.has(m)).sort();

  // Conservative: don't flag registry models as missing unless we have
  // provider→registry mapping (APIs return provider-specific IDs, not our IDs)
  const missingFromApis: string[] = [];

  return {
    registryModels: registryIds,
    probed,
    newInApis,
    missingFromApis,
    registryAge: ageDays,
    stale: ageDays > 30,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printProbeResults(probed: readonly ProbeResult[]): void {
  console.log('Probe Results:');
  for (const p of probed) {
    if (p.error !== undefined) {
      console.log(`  ⊘ ${p.source}: skipped (${p.error})`);
    } else {
      console.log(`  ✓ ${p.source}: ${String(p.models.length)} models found`);
    }
  }
  console.log('');
}

function printDrift(report: DriftReport): void {
  if (report.newInApis.length > 0) {
    console.log(`⚡ New models found (${String(report.newInApis.length)}):`);
    for (const m of report.newInApis) console.log(`  + ${m}`);
    console.log('');
  }

  if (report.newInApis.length === 0 && report.missingFromApis.length === 0) {
    console.log('✓ No drift detected. Registry is current.');
  } else {
    console.log('Action needed: review drift and update model-capabilities.ts');
    console.log('Then run: npx tsx scripts/inject-governance.ts');
  }
}

function printReport(report: DriftReport): void {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     Model Registry Probe Report          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  const ageColor = report.stale ? '\x1b[33m' : '\x1b[32m';
  const reset = '\x1b[0m';
  console.log(
    `Registry: ${String(report.registryModels.length)} models, ` +
      `${ageColor}${String(report.registryAge)} days old${reset}`
  );
  if (report.stale) console.log('⚠ Registry is stale (>30 days). Consider updating.');
  console.log('');

  printProbeResults(report.probed);
  printDrift(report);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const jsonMode = process.argv.includes('--json');

  const registry = readRegistryModelIds();
  console.log(`Probing ${String(registry.ids.length)} registry models...`);

  const probed = await Promise.all([
    probeAnthropic(),
    probeGoogle(),
    probeOpenAI(),
    probeOpenCode(),
  ]);

  const report = computeDrift(registry.ids, probed);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  // Exit with non-zero if drift detected (for CI)
  if (report.newInApis.length > 0 || report.missingFromApis.length > 0 || report.stale) {
    process.exit(1);
  }
}

void main();
