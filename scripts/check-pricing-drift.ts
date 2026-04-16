#!/usr/bin/env tsx
/**
 * Cross-check our model-capabilities.ts pricing and context windows against
 * litellm's community-maintained catalog.
 *
 * Non-blocking advisory: prints a diff table and exits 0 regardless.
 * Run periodically (e.g. after a model provider price change) or as a
 * pre-release sanity check.
 *
 * Usage: `npx tsx scripts/check-pricing-drift.ts`
 *
 * @module scripts/check-pricing-drift
 * (Source: Issue #1896 — litellm catalog cross-check)
 */

import { DEFAULT_MODEL_CAPABILITIES } from '../packages/nexus-agents/src/config/model-capabilities.js';

/** litellm's per-model schema we care about. Source: model_prices_and_context_window.json. */
interface LitellmModelEntry {
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  litellm_provider?: string;
}

type LitellmCatalog = Record<string, LitellmModelEntry>;

const LITELLM_CATALOG_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

/**
 * Map our model IDs to the keys litellm uses. Our IDs are semantic aliases
 * (e.g. 'claude-opus'), theirs are more specific (e.g. 'claude-opus-4-6').
 * We prefer `cliModelName` (which IS the provider-specific name) when present.
 */
function getLitellmKey(ourModel: (typeof DEFAULT_MODEL_CAPABILITIES.models)[number]): string {
  return ourModel.cliModelName ?? ourModel.id;
}

async function fetchLitellmCatalog(): Promise<LitellmCatalog> {
  const res = await fetch(LITELLM_CATALOG_URL, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch litellm catalog: HTTP ${String(res.status)}`);
  }
  return (await res.json()) as LitellmCatalog;
}

interface DriftReport {
  modelId: string;
  litellmKey: string;
  field: 'contextWindow' | 'inputPer1M' | 'outputPer1M';
  ours: number | undefined;
  theirs: number | undefined;
  delta: string;
}

function compareModel(
  ourModel: (typeof DEFAULT_MODEL_CAPABILITIES.models)[number],
  catalog: LitellmCatalog,
): DriftReport[] {
  const key = getLitellmKey(ourModel);
  const theirs = catalog[key];
  if (theirs === undefined) {
    return [];
  }

  const reports: DriftReport[] = [];

  // Context window
  const theirContext = theirs.max_input_tokens ?? theirs.max_tokens;
  if (theirContext !== undefined && ourModel.contextWindow !== theirContext) {
    reports.push({
      modelId: ourModel.id,
      litellmKey: key,
      field: 'contextWindow',
      ours: ourModel.contextWindow,
      theirs: theirContext,
      delta: `${String(ourModel.contextWindow)} → ${String(theirContext)}`,
    });
  }

  // Pricing — litellm is per-token, we're per-million
  if (theirs.input_cost_per_token !== undefined) {
    const theirInputPer1M = theirs.input_cost_per_token * 1_000_000;
    const ourInput = ourModel.pricing?.inputPer1M;
    if (ourInput !== undefined && Math.abs(ourInput - theirInputPer1M) > 0.01) {
      reports.push({
        modelId: ourModel.id,
        litellmKey: key,
        field: 'inputPer1M',
        ours: ourInput,
        theirs: theirInputPer1M,
        delta: `$${ourInput.toFixed(2)} → $${theirInputPer1M.toFixed(2)}`,
      });
    }
  }
  if (theirs.output_cost_per_token !== undefined) {
    const theirOutputPer1M = theirs.output_cost_per_token * 1_000_000;
    const ourOutput = ourModel.pricing?.outputPer1M;
    if (ourOutput !== undefined && Math.abs(ourOutput - theirOutputPer1M) > 0.01) {
      reports.push({
        modelId: ourModel.id,
        litellmKey: key,
        field: 'outputPer1M',
        ours: ourOutput,
        theirs: theirOutputPer1M,
        delta: `$${ourOutput.toFixed(2)} → $${theirOutputPer1M.toFixed(2)}`,
      });
    }
  }

  return reports;
}

async function main(): Promise<void> {
  console.log('Fetching litellm catalog…');
  let catalog: LitellmCatalog;
  try {
    catalog = await fetchLitellmCatalog();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`⚠️  Catalog fetch failed (non-blocking): ${msg}`);
    process.exit(0);
  }
  console.log(`Catalog has ${String(Object.keys(catalog).length)} entries.\n`);

  const allReports: DriftReport[] = [];
  const missing: string[] = [];

  for (const model of DEFAULT_MODEL_CAPABILITIES.models) {
    const key = getLitellmKey(model);
    if (catalog[key] === undefined) {
      missing.push(`${model.id} (looked up as '${key}')`);
      continue;
    }
    allReports.push(...compareModel(model, catalog));
  }

  if (allReports.length === 0 && missing.length === 0) {
    console.log('✅ No drift — our pricing matches litellm for all tracked models.');
    return;
  }

  if (allReports.length > 0) {
    console.log(`📊 Drift found in ${String(allReports.length)} field(s):\n`);
    for (const r of allReports) {
      console.log(`  ${r.modelId.padEnd(20)} ${r.field.padEnd(15)} ${r.delta}`);
    }
    console.log('');
  }

  if (missing.length > 0) {
    console.log(`ℹ️  ${String(missing.length)} models not in litellm catalog (expected for opencode, custom, etc.):`);
    for (const m of missing) console.log(`  • ${m}`);
    console.log('');
  }

  console.log('Review and update packages/nexus-agents/src/config/model-capabilities.ts if drift is real.');
  console.log('Non-blocking: script always exits 0.');
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`Script error: ${msg}`);
  process.exit(0);
});
