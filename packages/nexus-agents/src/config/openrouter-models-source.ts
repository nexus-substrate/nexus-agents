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
 *  - **Existence only**: we read ids, never pricing/capability (those stay
 *    authoritative in the in-tree registry).
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

const OpenRouterModelSchema = z.object({ id: z.string().min(1).max(256) });
const OpenRouterModelsResponseSchema = z.object({ data: z.array(OpenRouterModelSchema) });

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
export function createOpenRouterModelsSource(
  opts: OpenRouterModelsSourceOptions = {}
): AvailableModelsSource {
  const url = opts.url ?? OPENROUTER_MODELS_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  const logger = createLogger({ component: 'openrouter-models-source' });

  return {
    name: 'openrouter',
    providerHint: 'openrouter',
    async listModels(): Promise<readonly { id: string }[]> {
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
          logger.warn('OpenRouter catalog fetch returned non-OK; treating as empty', {
            status: res.status,
          });
          return [];
        }
        const text = await res.text();
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
        const ids = parsed.data.data.slice(0, MAX_MODELS).map((m) => ({ id: m.id }));
        logger.debug('OpenRouter catalog loaded', { count: ids.length });
        return ids;
      } catch (error: unknown) {
        // Fail-open: probe failure (network/timeout/parse) → empty list.
        logger.warn('OpenRouter catalog fetch failed; treating as empty', {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
