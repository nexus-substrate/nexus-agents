/**
 * OpenRouter live-catalog AvailableModelsSource (#3404, epic #3403).
 *
 * Fetches the unauthenticated `GET /api/v1/models` catalog so routing/discovery
 * can see the models OpenRouter actually offers right now (including `:free`
 * variants) and prune stale/renamed ids — e.g. it would have caught
 * `qwen/qwen3-coder-480b-a35b:free` → `qwen/qwen3-coder:free`.
 *
 * Guardrails (the catalog is untrusted external input — Epic #818, Tier 3):
 *  - **Zod-validated** shape; anything malformed yields an empty list.
 *  - **Size-bounded** (byte cap + max model count) so a hostile/huge payload
 *    can't blow memory.
 *  - **Timeout-bounded** via AbortController.
 *  - **Fail-OPEN**: any error returns `[]`, so the AvailableModelsCache simply
 *    keeps prior/other sources — a probe failure never wedges routing.
 *  - **Existence for routing**: routing reads ids only; pricing/capability stay
 *    authoritative in the in-tree registry. The listing's `created`,
 *    `context_length` and `pricing` are parsed for the model-drift report
 *    (#6625), which drafts registry entries from them and never applies them.
 *
 * @module config/openrouter-models-source
 */
import { z } from 'zod';

import { createLogger } from '../core/index.js';

import type { AvailableModelsSource } from './available-models-cache.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_TIMEOUT_MS = 8_000;
/** Cap on returned ids — bounds an untrusted/huge catalog. */
const MAX_MODELS = 5_000;
/** Byte cap on the raw response body (~8 MB) — the real catalog is well under. */
const MAX_BYTES = 8_000_000;

/** Cap on a model's `supported_parameters` list — bounds an untrusted payload. */
const MAX_SUPPORTED_PARAMETERS = 256;

const OpenRouterModelSchema = z.object({
  id: z.string().min(1).max(256),
  // #4121: the provider's machine-readable capability list. Optional & additive —
  // older catalogs (and our older fixtures) omit it; consumers reading only `.id`
  // are unaffected. Bounded so a hostile payload can't blow memory.
  supported_parameters: z.array(z.string().max(256)).max(MAX_SUPPORTED_PARAMETERS).optional(),
  // #6625: listing metadata for the model-drift report. Decorative, so a
  // malformed value becomes `undefined` instead of discarding the record.
  created: z.number().int().positive().optional().catch(undefined),
  context_length: z.number().int().positive().optional().catch(undefined),
  pricing: z
    .object({
      prompt: z.string().max(64).optional().catch(undefined),
      completion: z.string().max(64).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});
const OpenRouterModelsResponseSchema = z.object({ data: z.array(OpenRouterModelSchema) });

/** Listing price, converted from OpenRouter's USD-per-token strings to USD per 1M tokens. */
interface OpenRouterCatalogPricing {
  readonly inputPer1M?: number;
  readonly outputPer1M?: number;
}

/**
 * A validated catalog model. `supportedParameters` is the provider's
 * machine-readable capability list (#4121) — `undefined` when the catalog omits
 * it (backward-compat). Existing existence-only consumers read `.id` and ignore it.
 * `createdAt` (epoch seconds), `contextLength` and `pricing` are listing
 * metadata for the model-drift report (#6625); each is absent when the catalog
 * omits it or sends a malformed value.
 */
export interface OpenRouterCatalogModel {
  readonly id: string;
  readonly supportedParameters?: readonly string[];
  readonly createdAt?: number;
  readonly contextLength?: number;
  readonly pricing?: OpenRouterCatalogPricing;
}

/** The cache source, typed with the metadata its catalog rows carry (#6625). */
interface OpenRouterModelsSource extends AvailableModelsSource {
  listModels(): Promise<readonly OpenRouterCatalogModel[]>;
}

const TOKENS_PER_MILLION = 1_000_000;

/** USD-per-token string → USD per 1M tokens; `undefined` for anything not a finite, non-negative number. */
function perMillion(perToken: string | undefined): number | undefined {
  if (perToken === undefined || perToken.trim() === '') return undefined;
  const value = Number(perToken);
  if (!Number.isFinite(value) || value < 0) return undefined;
  // Round away float noise (0.000003 * 1e6 = 2.9999999999999996).
  return Math.round(value * TOKENS_PER_MILLION * 1e6) / 1e6;
}

function toCatalogModel(m: z.infer<typeof OpenRouterModelSchema>): OpenRouterCatalogModel {
  const inputPer1M = perMillion(m.pricing?.prompt);
  const outputPer1M = perMillion(m.pricing?.completion);
  const pricing: OpenRouterCatalogPricing = {
    ...(inputPer1M !== undefined && { inputPer1M }),
    ...(outputPer1M !== undefined && { outputPer1M }),
  };
  return {
    id: m.id,
    ...(m.supported_parameters !== undefined && { supportedParameters: m.supported_parameters }),
    ...(m.created !== undefined && { createdAt: m.created }),
    ...(m.context_length !== undefined && { contextLength: m.context_length }),
    ...(Object.keys(pricing).length > 0 && { pricing }),
  };
}

export interface OpenRouterModelsSourceOptions {
  /** Override the catalog URL (tests / self-hosted gateways). */
  readonly url?: string;
  /** Per-fetch timeout in ms (default 8s). */
  readonly timeoutMs?: number;
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Build an {@link AvailableModelsSource} backed by OpenRouter's live catalog.
 * Register it on the {@link AvailableModelsCache} (which owns TTL +
 * stale-while-revalidate + single-in-flight coalescing).
 */
const logger = createLogger({ component: 'openrouter-models-source' });

/**
 * Validate + cap a catalog body. Returns `[]` on oversize or schema failure.
 * Widened in #4121 to also surface each model's `supported_parameters` (as
 * `supportedParameters`); the field is omitted when the provider doesn't send it,
 * so existing `.id`-only readers are unaffected.
 */
export function parseCatalog(text: string): readonly OpenRouterCatalogModel[] {
  if (text.length > MAX_BYTES) {
    logger.warn('OpenRouter catalog exceeds byte cap; ignoring', { bytes: text.length });
    return [];
  }
  const parsed = OpenRouterModelsResponseSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    logger.warn('OpenRouter catalog failed schema validation; treating as empty', {
      error: parsed.error.message,
    });
    return [];
  }
  return parsed.data.data.slice(0, MAX_MODELS).map(toCatalogModel);
}

/** Fetch + validate the catalog. Fail-OPEN: any failure returns `[]`. */
/**
 * Fetch the catalog, THROWING on any probe failure (#5059).
 *
 * The cache source uses this variant. It used to swallow failures into `[]`,
 * which reached `AvailableModelsCache` on the success path: the empty list
 * overwrote a good catalog and was stamped fresh for the whole TTL, and
 * `list_available_models` reported the dead transport as `ok: true`. An empty
 * result must mean "the catalog is empty", never "the probe did not run".
 *
 * {@link fetchOpenRouterCatalog} keeps the fail-open behaviour for the #4121
 * drift job, which documents `[]` as a loud skip.
 */
async function fetchCatalogOrThrow(
  url: string,
  timeoutMs: number,
  doFetch: typeof fetch
): Promise<readonly OpenRouterCatalogModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await doFetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`OpenRouter catalog fetch returned HTTP ${String(res.status)}`);
    }
    // Pre-check Content-Length so a hostile/huge body is rejected BEFORE it is
    // buffered. The text().length check is a backstop for servers that omit or
    // lie about Content-Length.
    const declaredLen = res.headers.get('content-length');
    if (declaredLen !== null && Number(declaredLen) > MAX_BYTES) {
      throw new Error(`OpenRouter catalog Content-Length ${declaredLen} exceeds the byte cap`);
    }
    const ids = parseCatalog(await res.text());
    logger.debug('OpenRouter catalog loaded', { count: ids.length });
    return ids;
  } finally {
    clearTimeout(timer);
  }
}

/** Fail-open wrapper: any probe failure yields `[]`. */
async function fetchCatalog(
  url: string,
  timeoutMs: number,
  doFetch: typeof fetch
): Promise<readonly OpenRouterCatalogModel[]> {
  try {
    return await fetchCatalogOrThrow(url, timeoutMs, doFetch);
  } catch (error: unknown) {
    logger.warn('OpenRouter catalog fetch failed; treating as empty', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function createOpenRouterModelsSource(
  opts: OpenRouterModelsSourceOptions = {}
): OpenRouterModelsSource {
  const url = opts.url ?? OPENROUTER_MODELS_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    name: 'openrouter',
    providerHint: 'openrouter',
    // Throws on probe failure so the cache can tell it apart from an empty
    // catalog (#5059).
    listModels: () => fetchCatalogOrThrow(url, timeoutMs, doFetch),
  };
}

/**
 * Fetch the OpenRouter catalog WITH `supportedParameters` retained in the return
 * type (the {@link AvailableModelsSource} interface narrows to `.id`-only). Used by
 * the #4121 parameter-drift reconciliation job, which needs the provider's
 * capability list. Preserves the same fail-OPEN semantics — any fetch/schema
 * failure yields `[]`. The reconciliation job treats an empty result as a LOUD
 * skip (the real catalog is never empty), NOT as "no drift".
 */
export function fetchOpenRouterCatalog(
  opts: OpenRouterModelsSourceOptions = {}
): Promise<readonly OpenRouterCatalogModel[]> {
  const url = opts.url ?? OPENROUTER_MODELS_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  return fetchCatalog(url, timeoutMs, doFetch);
}
