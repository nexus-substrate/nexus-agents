#!/usr/bin/env tsx
/**
 * Reconcile the hand-curated model-parameter capability map against the
 * provider's machine-readable `supported_parameters` (#4121, epic #4066 layer 4).
 *
 * The curated map — `KNOWN_PARAMETER_INCOMPATIBILITIES` +
 * `ModelCapability.unsupportedParameters` / `.maxTokensParam`, resolved through
 * `unsupportedParametersForModel` — is the SOURCE OF TRUTH a human vets. This job
 * NEVER edits it. It only checks whether the provider's advertised capabilities
 * still agree with what the curated map asserts, and prints a machine-readable
 * status the `parameter-drift.yml` workflow uses to open ONE issue on drift.
 *
 * Output contract (parsed by the workflow):
 *   PARAM_DRIFT_STATUS=clean|drift|skipped
 *   PARAM_DRIFT_COUNT=<n>
 *   PARAM_DRIFT_JOINED=<registry models that joined the catalog> (#5677; 0 → skipped)
 *
 * FAIL-LOUD on a provider fetch failure: the OpenRouter catalog is never legitimately
 * empty, so an empty result is a fetch problem — we emit `skipped` (NOT a false
 * `clean`/"no drift") so a provider outage can never mask real drift. Advisory:
 * always exits 0 (drift is reported via an issue, never a red build).
 *
 * Usage: `pnpm exec tsx scripts/check-parameter-drift.ts`
 *
 * @module scripts/check-parameter-drift
 * (Source: Issue #4121 — provider-reality reconciliation for the param-capability map)
 */
/* eslint-disable no-console */

import { fetchOpenRouterCatalog } from '../packages/nexus-agents/src/config/openrouter-models-source.js';
import { getInTreeCapabilitiesMatrix } from '../packages/nexus-agents/src/config/model-config-helpers.js';
import { unsupportedParametersForModel } from '../packages/nexus-agents/src/config/model-parameter-support.js';
import {
  reconcileParameterDrift,
  summarizeParameterJoin,
  type RegistryParamView,
} from './parameter-drift-reconcile.js';

/** Build the curated-map view: one entry per registered model with the ids it may
 * appear under in the provider catalog and its resolver-computed unsupported set. */
function buildRegistryViews(): RegistryParamView[] {
  const { models } = getInTreeCapabilitiesMatrix();
  return models.map((m) => {
    const providerIds = [m.id, m.cliModelName].filter(
      (v): v is string => typeof v === 'string' && v.length > 0
    );
    return {
      modelId: m.id,
      providerIds: [...new Set(providerIds)],
      unsupportedParameters: [...unsupportedParametersForModel(m.id)],
    };
  });
}

/**
 * Name the join (#5677): the reconcile skips every registry model whose ids
 * match nothing in the catalog, so an empty findings list used to read as
 * "clean" even when nothing had been compared. Returns false (after emitting
 * `skipped`) when no model joined.
 */
function reportJoin(
  catalog: Parameters<typeof summarizeParameterJoin>[0],
  registryViews: RegistryParamView[]
): boolean {
  const join = summarizeParameterJoin(catalog, registryViews);
  console.log(
    `Joined ${String(join.joined.length)} of ${String(registryViews.length)} registry models to the catalog.`
  );
  if (join.unmatched.length > 0) {
    console.log('Not in the catalog under any known id (not reconciled):');
    for (const id of join.unmatched) console.log(`  - ${id}`);
  }
  console.log(`PARAM_DRIFT_JOINED=${String(join.joined.length)}`);
  if (join.joined.length === 0) {
    console.error(
      '⚠️  SKIP: no registry model joined the provider catalog — nothing was reconciled. ' +
        'Not "no drift".'
    );
    console.log('PARAM_DRIFT_STATUS=skipped');
    console.log('PARAM_DRIFT_COUNT=0');
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  console.log('Fetching OpenRouter catalog (supported_parameters)…');
  const catalog = await fetchOpenRouterCatalog();

  // Fail-LOUD: the real catalog is never empty; an empty result means the fetch
  // failed (network/timeout/schema/size). Do NOT report "no drift" — skip loudly.
  if (catalog.length === 0) {
    console.error(
      '⚠️  SKIP: OpenRouter catalog came back empty — treating as a FETCH FAILURE, not "no drift".'
    );
    console.error(
      '   A provider outage must not mask real parameter drift. Re-run when reachable.'
    );
    console.log('PARAM_DRIFT_STATUS=skipped');
    console.log('PARAM_DRIFT_COUNT=0');
    return;
  }
  console.log(`Catalog has ${String(catalog.length)} models.`);

  const withCaps = catalog.filter((m) => m.supportedParameters !== undefined).length;
  console.log(`${String(withCaps)} advertise a supported_parameters list.\n`);

  const registryViews = buildRegistryViews();

  if (!reportJoin(catalog, registryViews)) return;

  const findings = reconcileParameterDrift(catalog, registryViews);

  if (findings.length === 0) {
    console.log(
      '✅ No parameter drift — the curated map agrees with the provider for every model that joined.'
    );
    console.log('PARAM_DRIFT_STATUS=clean');
    console.log('PARAM_DRIFT_COUNT=0');
    return;
  }

  console.log(`📊 Parameter drift found for ${String(findings.length)} (model, param) pair(s):\n`);
  for (const f of findings) {
    const registry = f.registrySupported ? 'supported' : 'unsupported';
    const provider = f.providerSupported ? 'supported' : 'unsupported';
    console.log(
      `  ${f.modelId.padEnd(24)} ${f.param.padEnd(14)} registry=${registry.padEnd(11)} provider=${provider}  (catalog id: ${f.providerId})`
    );
  }
  console.log('');
  console.log('The curated map is hand-vetted — this job does NOT auto-edit it.');
  console.log(
    'Review packages/nexus-agents/src/config/model-parameter-support.ts (KNOWN_PARAMETER_INCOMPATIBILITIES)'
  );
  console.log(
    'and the affected models’ unsupportedParameters in in-tree-data.ts, then reconcile by hand.'
  );
  console.log(`PARAM_DRIFT_STATUS=drift`);
  console.log(`PARAM_DRIFT_COUNT=${String(findings.length)}`);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  // Even an unexpected error is a LOUD skip, never a silent "clean".
  console.error(`⚠️  SKIP: parameter-drift check errored (non-blocking): ${msg}`);
  console.log('PARAM_DRIFT_STATUS=skipped');
  console.log('PARAM_DRIFT_COUNT=0');
  process.exit(0);
});
