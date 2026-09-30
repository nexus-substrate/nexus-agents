/**
 * Key-free model enumeration for CLI-subprocess adapters via models.dev (#3405).
 *
 * claude/codex/gemini CLIs have no `list-models` command, and their OAuth tokens
 * can't call the vendor `/v1/models` REST endpoints (inference-only). So we
 * enumerate from the committed, CI-refreshed **models.dev snapshot** filtered by
 * vendor — a current, comprehensive, *key-free* catalog. This is EXISTENCE only
 * (liveness is handled reactively by the 404 fallback); the in-tree registry
 * stays authoritative for pricing/capability.
 *
 * Fail-OPEN: a missing/malformed snapshot yields `[]`, never throws.
 *
 * @module config/models-dev-by-vendor
 */
import { createLogger } from '../core/index.js';

import { loadModelsDevSnapshot } from './models-dev-snapshot-loader.js';

const logger = createLogger({ component: 'models-dev-by-vendor' });

/**
 * CLI name → models.dev vendor key. opencode is intentionally absent — it has a
 * native `opencode models` probe (wired separately).
 */
export const CLI_TO_MODELSDEV_VENDOR: Readonly<Record<string, string>> = {
  claude: 'anthropic',
  codex: 'openai',
  gemini: 'google',
};

/**
 * CLIs whose models.dev vendor catalogue is known NOT to be the set the CLI
 * serves, with the caveat a report must carry beside that catalogue (#5086).
 *
 * codex serves a curated subset of the `openai` catalogue (7 of 47 at the
 * #5086 audit), so the vendor list over-advertises. The panel on #5086 chose to
 * keep the superset and label it rather than enumerate from codex's private
 * cache: nothing selects an individual model from this list today, and
 * `getCandidateCliNames` only tests non-emptiness, which a superset cannot flip.
 * #5090 tracks the trigger that reverses that choice.
 *
 * claude is absent on purpose: the Claude CLI takes Anthropic API ids, so the
 * `anthropic` catalogue is its vocabulary.
 */
export const MODELSDEV_CATALOGUE_CAVEATS: Readonly<Record<string, string>> = {
  codex:
    'Vendor-catalogue superset (models.dev `openai`), not the runnable set: codex serves only ' +
    'the visibility:list slugs in its own models cache (see the `nexus-agents verify` codex models ' +
    'check), so most ids listed here are rejected by `codex -m` (#5086, #5090).',
};

interface VendoredId {
  readonly id: string;
  readonly vendor: string;
}

let cached: readonly VendoredId[] | null = null;

function loadEntries(): readonly VendoredId[] {
  if (cached !== null) return cached;
  try {
    const { entries } = loadModelsDevSnapshot();
    // `vendor` is a required ModelEntry field; a non-matching/absent value simply
    // fails the equality filter below, so no defensive fallback is needed.
    cached = entries.map((e) => ({ id: e.id, vendor: e.vendor }));
  } catch (error: unknown) {
    logger.debug('models.dev snapshot load failed; enumeration empty', {
      error: error instanceof Error ? error.message : String(error),
    });
    cached = [];
  }
  return cached;
}

/** Reset the in-process snapshot cache (tests). */
export function resetModelsDevByVendorCache(): void {
  cached = null;
}

/** All model ids the models.dev snapshot lists for `vendor`. */
export function listModelsByVendor(vendor: string): readonly { id: string }[] {
  return loadEntries()
    .filter((e) => e.vendor === vendor)
    .map((e) => ({ id: e.id }));
}

/**
 * Model ids for a CLI, mapped via {@link CLI_TO_MODELSDEV_VENDOR}. Returns `[]`
 * for CLIs without a vendor mapping (e.g. opencode, which enumerates natively).
 */
export function listModelsForCli(cliName: string): readonly { id: string; provider: string }[] {
  const vendor = CLI_TO_MODELSDEV_VENDOR[cliName];
  if (vendor === undefined) return [];
  return listModelsByVendor(vendor).map((m) => ({ id: m.id, provider: vendor }));
}
