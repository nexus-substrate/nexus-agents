#!/usr/bin/env tsx
/**
 * Cross-check our in-tree-data.ts pricing and context windows against
 * litellm's community-maintained catalog.
 *
 * Non-blocking advisory: prints a diff table and exits 0 regardless. Because
 * the exit code carries no signal, the machine-readable verdict is on stdout:
 *
 *   PRICING_DRIFT_STATUS=clean|drift|skipped
 *   PRICING_DRIFT_COUNT=<n>
 *
 * `skipped` is the load-bearing one. A catalog fetch failure previously exited
 * 0 with no drift table, which the workflow's `grep … || echo "0"` read as
 * zero drift — so a litellm outage was indistinguishable from clean pricing
 * (#4927). Mirrors `check-parameter-drift.ts`, which already had this shape.
 *
 * Run periodically (e.g. after a model provider price change) or as a
 * pre-release sanity check.
 *
 * Usage: `npx tsx scripts/check-pricing-drift.ts`
 *
 * @module scripts/check-pricing-drift
 * (Source: Issue #1896 — litellm catalog cross-check)
 */

/* eslint-disable no-console */

// model-capabilities.ts was renamed to in-tree-data.ts in #2546 slice E; this
// import silently broke the gate until #4173 repointed it.
import { DEFAULT_MODEL_CAPABILITIES } from '../packages/nexus-agents/src/config/in-tree-data.js';

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

/** Compare one per-million pricing field; litellm is per-token, we're per-million. */
function comparePricingField(
  modelId: string,
  key: string,
  field: 'inputPer1M' | 'outputPer1M',
  ours: number | undefined,
  theirCostPerToken: number | undefined
): DriftReport | undefined {
  if (theirCostPerToken === undefined || ours === undefined) return undefined;
  const theirsPer1M = theirCostPerToken * 1_000_000;
  if (Math.abs(ours - theirsPer1M) <= 0.01) return undefined;
  return {
    modelId,
    litellmKey: key,
    field,
    ours,
    theirs: theirsPer1M,
    delta: `$${ours.toFixed(2)} → $${theirsPer1M.toFixed(2)}`,
  };
}

function compareModel(
  ourModel: (typeof DEFAULT_MODEL_CAPABILITIES.models)[number],
  catalog: LitellmCatalog
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

  const input = comparePricingField(
    ourModel.id,
    key,
    'inputPer1M',
    ourModel.pricing?.inputPer1M,
    theirs.input_cost_per_token
  );
  if (input !== undefined) reports.push(input);
  const output = comparePricingField(
    ourModel.id,
    key,
    'outputPer1M',
    ourModel.pricing?.outputPer1M,
    theirs.output_cost_per_token
  );
  if (output !== undefined) reports.push(output);

  return reports;
}

async function main(): Promise<void> {
  console.log('Fetching litellm catalog…');
  let catalog: LitellmCatalog;
  try {
    catalog = await fetchLitellmCatalog();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`⚠️  SKIP: litellm catalog fetch failed (non-blocking): ${msg}`);
    console.error('   A provider outage must not mask real pricing drift. Re-run when reachable.');
    console.log('PRICING_DRIFT_STATUS=skipped');
    console.log('PRICING_DRIFT_COUNT=0');
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

  printReports(allReports, missing);
}

function printReports(allReports: DriftReport[], missing: string[]): void {
  if (allReports.length === 0 && missing.length === 0) {
    console.log('✅ No drift — our pricing matches litellm for all tracked models.');
    console.log('PRICING_DRIFT_STATUS=clean');
    console.log('PRICING_DRIFT_COUNT=0');
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
    console.log(
      `ℹ️  ${String(missing.length)} models not in litellm catalog (expected for opencode, custom, etc.):`
    );
    for (const m of missing) console.log(`  • ${m}`);
    console.log('');
  }

  console.log(
    'Review and update packages/nexus-agents/src/config/in-tree-data.ts if drift is real.'
  );
  console.log('Non-blocking: script always exits 0 — read PRICING_DRIFT_STATUS instead.');
  console.log(`PRICING_DRIFT_STATUS=${allReports.length === 0 ? 'clean' : 'drift'}`);
  console.log(`PRICING_DRIFT_COUNT=${String(allReports.length)}`);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  // Even an unexpected error is a LOUD skip, never a silent "clean".
  console.error(`⚠️  SKIP: pricing-drift check errored (non-blocking): ${msg}`);
  console.log('PRICING_DRIFT_STATUS=skipped');
  console.log('PRICING_DRIFT_COUNT=0');
  process.exit(0);
});
