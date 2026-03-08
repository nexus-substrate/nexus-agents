#!/usr/bin/env -S npx tsx
/**
 * sync-model-pricing — Fetch pricing data from models.dev and compare
 * against our canonical model registry.
 *
 * Usage:
 *   npx tsx scripts/sync-model-pricing.ts          # Show diff only
 *   npx tsx scripts/sync-model-pricing.ts --apply   # Apply changes
 *
 * Source: Issue #1125
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC_ROOT } from './script-paths.js';

const MODEL_CAP_PATH = join(SRC_ROOT, 'config/model-capabilities.ts');
const MODELS_DEV_URL = 'https://models.dev/api.json';

interface ModelsDevEntry {
  id: string;
  name?: string;
  family?: string;
  cost?: { input?: number; output?: number; cache_read?: number };
  limit?: { context?: number; output?: number };
}

interface PricingDiff {
  modelId: string;
  field: string;
  current: number;
  upstream: number;
}

// Maps our cliModelName → possible models.dev IDs (try multiple patterns)
// models.dev uses "provider/model-id" format
const CLI_TO_UPSTREAM: Record<string, string[]> = {
  'claude-opus-4-6': ['anthropic/claude-opus-4-6', 'claude-opus-4-6'],
  'claude-sonnet-4-5-20250929': [
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-sonnet-4-5',
    'claude-sonnet-4-5-20250929',
  ],
  'claude-haiku-4-5-20251001': ['anthropic/claude-haiku-4-5', 'claude-haiku-4-5-20251001'],
  'gemini-3-pro-preview': ['google/gemini-3-pro-preview', 'gemini-3-pro-preview'],
  'gemini-2.5-pro': ['google/gemini-2.5-pro', 'gemini-2.5-pro'],
  'gemini-3-flash-preview': ['google/gemini-3-flash-preview', 'gemini-3-flash-preview'],
  'gemini-2.5-flash': ['google/gemini-2.5-flash', 'gemini-2.5-flash'],
  'codex-5.3': ['openai/gpt-5.3-codex', 'gpt-5.3-codex'],
  'codex-5.2': ['openai/gpt-5.2-codex', 'gpt-5.2-codex'],
  'codex-5.1-mini': ['openai/gpt-5.1-codex-mini', 'gpt-5.1-codex-mini'],
};

async function fetchCatalog(): Promise<ModelsDevEntry[]> {
  console.log(`Fetching ${MODELS_DEV_URL}...`);
  const res = await fetch(MODELS_DEV_URL);
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  const data = (await res.json()) as Record<string, { models?: Record<string, ModelsDevEntry> }>;

  // Flatten provider→models hierarchy into a flat array
  const entries: ModelsDevEntry[] = [];
  for (const [providerKey, provider] of Object.entries(data)) {
    if (!provider.models) continue;
    for (const [modelKey, model] of Object.entries(provider.models)) {
      entries.push({ ...model, id: `${providerKey}/${modelKey}` });
    }
  }
  return entries;
}

function findModel(catalog: ModelsDevEntry[], candidates: string[]): ModelsDevEntry | undefined {
  for (const candidate of candidates) {
    const exact = catalog.find((m) => m.id === candidate);
    if (exact) return exact;
    const suffixed = catalog.find((m) => m.id.endsWith(`/${candidate}`));
    if (suffixed) return suffixed;
  }
  return undefined;
}

/** models.dev stores cost per 1M tokens — same as our format. */
function normalizePrice(perMillion: number): number {
  return Math.round(perMillion * 100) / 100;
}

interface RegistryModel {
  cliModelName: string;
  displayName: string;
  pricing: { inputPer1M: number; outputPer1M: number };
  contextWindow: number;
  maxOutputTokens: number;
}

/** Walk backward from `pos` to find the opening `{` at brace depth 0. */
function findBlockStart(source: string, pos: number): number {
  let braceCount = 0;
  for (let i = pos; i >= 0; i--) {
    if (source[i] === '}') braceCount++;
    if (source[i] === '{') {
      if (braceCount === 0) return i;
      braceCount--;
    }
  }
  return pos;
}

/** Walk forward from `start` to find the matching closing `}`. */
function findBlockEnd(source: string, start: number): number {
  let braceCount = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') braceCount++;
    if (source[i] === '}') {
      braceCount--;
      if (braceCount === 0) return i + 1;
    }
  }
  return start;
}

/** Parse a model block into a RegistryModel, or undefined if missing fields. */
function parseModelBlock(block: string, cliModelName: string): RegistryModel | undefined {
  const displayMatch = /displayName:\s*'([^']+)'/.exec(block);
  const inputMatch = /inputPer1M:\s*([\d.]+)/.exec(block);
  const outputMatch = /outputPer1M:\s*([\d.]+)/.exec(block);
  const ctxMatch = /contextWindow:\s*([\d_]+)/.exec(block);
  const maxOutMatch = /maxOutputTokens:\s*([\d_]+)/.exec(block);
  if (!inputMatch || !outputMatch || !ctxMatch || !maxOutMatch) return undefined;
  return {
    cliModelName,
    displayName: displayMatch?.[1] ?? cliModelName,
    pricing: {
      inputPer1M: parseFloat(inputMatch[1]),
      outputPer1M: parseFloat(outputMatch[1]),
    },
    contextWindow: parseInt(ctxMatch[1].replace(/_/g, ''), 10),
    maxOutputTokens: parseInt(maxOutMatch[1].replace(/_/g, ''), 10),
  };
}

function extractRegistryModels(source: string): RegistryModel[] {
  const models: RegistryModel[] = [];
  const cliNameRegex = /cliModelName:\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = cliNameRegex.exec(source)) !== null) {
    const blockStart = findBlockStart(source, match.index);
    const blockEnd = findBlockEnd(source, blockStart);
    const block = source.slice(blockStart, blockEnd);
    const parsed = parseModelBlock(block, match[1]);
    if (parsed) models.push(parsed);
  }
  return models;
}

/** Check if a normalized price differs from the current value. */
function priceDiff(
  modelId: string,
  field: string,
  current: number,
  upstream: number | undefined
): PricingDiff | undefined {
  if (upstream === undefined) return undefined;
  const normalized = normalizePrice(upstream);
  if (Math.abs(normalized - current) <= 0.01) return undefined;
  return { modelId, field, current, upstream: normalized };
}

/** Check if a limit value differs from the current value. */
function limitDiff(
  modelId: string,
  field: string,
  current: number,
  upstream: number | undefined
): PricingDiff | undefined {
  if (upstream === undefined || upstream === current) return undefined;
  return { modelId, field, current, upstream };
}

/** Compare pricing and limits between a registry model and upstream entry. */
function diffModel(rm: RegistryModel, upstream: ModelsDevEntry): PricingDiff[] {
  const checks = [
    priceDiff(rm.displayName, 'inputPer1M', rm.pricing.inputPer1M, upstream.cost?.input),
    priceDiff(rm.displayName, 'outputPer1M', rm.pricing.outputPer1M, upstream.cost?.output),
    limitDiff(rm.displayName, 'contextWindow', rm.contextWindow, upstream.limit?.context),
    limitDiff(rm.displayName, 'maxOutputTokens', rm.maxOutputTokens, upstream.limit?.output),
  ];
  return checks.filter((d): d is PricingDiff => d !== undefined);
}

function computeDiffs(
  registryModels: RegistryModel[],
  catalog: ModelsDevEntry[]
): { diffs: PricingDiff[]; matched: number; unmatched: string[] } {
  const diffs: PricingDiff[] = [];
  const unmatched: string[] = [];
  let matched = 0;
  for (const rm of registryModels) {
    const candidates = CLI_TO_UPSTREAM[rm.cliModelName] ?? [rm.cliModelName];
    const upstream = findModel(catalog, candidates);
    if (!upstream) {
      unmatched.push(rm.cliModelName);
      continue;
    }
    matched++;
    diffs.push(...diffModel(rm, upstream));
  }
  return { diffs, matched, unmatched };
}

function applyDiffs(source: string, diffs: PricingDiff[]): string {
  let result = source;
  // Note: This is a simple approach — for production use, AST-based rewriting would be safer
  for (const diff of diffs) {
    if (diff.field === 'inputPer1M') {
      // Replace inputPer1M value near the model's displayName
      const pattern = new RegExp(
        `(displayName:\\s*'${diff.modelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?inputPer1M:\\s*)${String(diff.current)}`
      );
      result = result.replace(pattern, `$1${String(diff.upstream)}`);
    } else if (diff.field === 'outputPer1M') {
      const pattern = new RegExp(
        `(displayName:\\s*'${diff.modelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?outputPer1M:\\s*)${String(diff.current)}`
      );
      result = result.replace(pattern, `$1${String(diff.upstream)}`);
    }
    // Skip contextWindow/maxOutputTokens auto-apply (need manual review for formatting)
  }
  return result;
}

async function main(): Promise<void> {
  const applyFlag = process.argv.includes('--apply');

  const source = readFileSync(MODEL_CAP_PATH, 'utf-8');
  const registryModels = extractRegistryModels(source);
  console.log(`Found ${String(registryModels.length)} models in registry`);

  const catalog = await fetchCatalog();
  console.log(`Fetched ${String(catalog.length)} models from models.dev\n`);

  const { diffs, matched, unmatched } = computeDiffs(registryModels, catalog);

  console.log(`Matched: ${String(matched)}/${String(registryModels.length)} models`);
  if (unmatched.length > 0) {
    console.log(`Unmatched: ${unmatched.join(', ')}`);
  }
  console.log('');

  if (diffs.length === 0) {
    console.log('All pricing and limits are up to date!');
    return;
  }

  console.log(`Found ${String(diffs.length)} difference(s):\n`);
  for (const d of diffs) {
    const arrow = d.upstream > d.current ? '↑' : '↓';
    console.log(`  ${d.modelId}.${d.field}: ${String(d.current)} → ${String(d.upstream)} ${arrow}`);
  }

  if (applyFlag) {
    const updated = applyDiffs(source, diffs);
    writeFileSync(MODEL_CAP_PATH, updated);
    console.log(`\nApplied ${String(diffs.length)} pricing update(s) to model-capabilities.ts`);
    console.log('Run `pnpm build && pnpm test` to verify.');
  } else {
    console.log('\nRun with --apply to update model-capabilities.ts');
  }
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
