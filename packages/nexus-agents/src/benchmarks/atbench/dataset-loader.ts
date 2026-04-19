/**
 * ATBench — HuggingFace dataset loader (#1981 follow-up).
 *
 * Fetches ATBench-Claw or ATBench-CodeX trajectories from the public
 * HuggingFace Datasets API with pagination. No auth required — the
 * datasets are public. Pattern follows `src/swe-bench/dataset-loader.ts`.
 *
 * Typical usage:
 * ```ts
 * const rows = await fetchAtbenchFromHf({ variant: 'claw', limit: 50 });
 * if (rows.ok) {
 *   for (const raw of rows.value) {
 *     const parsed = ATBenchTrajectorySchema.safeParse(raw);
 *     if (parsed.success) trajectories.push(parsed.data);
 *   }
 * }
 * ```
 *
 * @module benchmarks/atbench/dataset-loader
 */

import { ATBenchTrajectorySchema, type ATBenchTrajectory } from './types.js';

/** HuggingFace Datasets Server base URL. */
const HF_ROWS_URL = 'https://datasets-server.huggingface.co/rows';

/** Max rows per HF API request (paginator limit). */
const HF_API_MAX_LENGTH = 100;

/** Timeout for a single HF API request (30s). */
const HF_API_TIMEOUT_MS = 30_000;

/** Map variant to HF dataset ID. */
const DATASET_IDS: Readonly<Record<'claw' | 'codex', string>> = {
  claw: 'AI45Research/ATBench-Claw',
  codex: 'AI45Research/ATBench-CodeX',
};

/** Options for fetching from HuggingFace. */
export interface HfLoaderOptions {
  readonly variant: 'claw' | 'codex';
  /** Optional cap on total rows fetched. Default: fetch everything. */
  readonly limit?: number;
  /** Offset into the dataset (for resume). Default: 0. */
  readonly offset?: number;
  /** Dataset config name in HF. Default: 'default'. */
  readonly config?: string;
  /** Dataset split. Default: 'test'. */
  readonly split?: string;
}

/** Result wrapper so callers can destructure ok/error cleanly. */
export type HfLoaderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: Error };

/**
 * Fetch and Zod-validate ATBench trajectories from HuggingFace.
 *
 * Invalid rows (that fail schema parse) are DROPPED with a count in
 * the error metadata — this is intentional for resilience against HF
 * upstream schema drift. If every row fails, returns an error.
 */
export async function fetchAtbenchFromHf(options: HfLoaderOptions): Promise<
  HfLoaderResult<{
    readonly trajectories: readonly ATBenchTrajectory[];
    readonly rawFetched: number;
    readonly parsed: number;
    readonly dropped: number;
  }>
> {
  const rows = await fetchAllPages(options);
  if (!rows.ok) return rows;

  const trajectories: ATBenchTrajectory[] = [];
  let dropped = 0;
  for (const raw of rows.value) {
    const parsed = ATBenchTrajectorySchema.safeParse(raw);
    if (parsed.success) trajectories.push(parsed.data);
    else dropped++;
  }

  if (trajectories.length === 0 && rows.value.length > 0) {
    return {
      ok: false,
      error: new Error(
        `ATBench HF fetch: all ${String(rows.value.length)} rows failed schema validation — upstream dataset shape may have changed`
      ),
    };
  }

  return {
    ok: true,
    value: {
      trajectories,
      rawFetched: rows.value.length,
      parsed: trajectories.length,
      dropped,
    },
  };
}

/** Fetch a single page from HF. Exposed for testing; consumers use fetchAllPages. */
export async function fetchPage(
  datasetId: string,
  options: HfLoaderOptions,
  offset: number,
  length: number
): Promise<HfLoaderResult<readonly unknown[]>> {
  const config = options.config ?? 'default';
  const split = options.split ?? 'test';
  const url = `${HF_ROWS_URL}?dataset=${encodeURIComponent(datasetId)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=${String(offset)}&length=${String(length)}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(HF_API_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: new Error(
          `HuggingFace API error: ${String(response.status)} ${response.statusText}`
        ),
      };
    }
    interface HfRowsResponse {
      readonly rows?: ReadonlyArray<{ readonly row: unknown }>;
    }
    const data = (await response.json()) as HfRowsResponse;
    const rows = data.rows;
    if (!Array.isArray(rows)) {
      return {
        ok: false,
        error: new Error('Invalid response format from HuggingFace (missing rows[])'),
      };
    }
    return { ok: true, value: rows.map((r: { readonly row: unknown }): unknown => r.row) };
  } catch (cause) {
    const isTimeout = cause instanceof Error && cause.name === 'TimeoutError';
    const message = isTimeout
      ? `HuggingFace API request timed out after ${String(HF_API_TIMEOUT_MS / 1000)}s`
      : `HuggingFace fetch failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    return { ok: false, error: new Error(message) };
  }
}

/** Fetch all pages up to the requested limit. */
async function fetchAllPages(
  options: HfLoaderOptions
): Promise<HfLoaderResult<readonly unknown[]>> {
  const datasetId = DATASET_IDS[options.variant];
  const startOffset = options.offset ?? 0;
  const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
  const rows: unknown[] = [];
  let offset = startOffset;

  while (rows.length < limit) {
    const remaining = limit - rows.length;
    const pageSize = Math.min(remaining, HF_API_MAX_LENGTH);
    const page = await fetchPage(datasetId, options, offset, pageSize);
    if (!page.ok) return page;
    if (page.value.length === 0) break; // end of dataset
    rows.push(...page.value);
    offset += page.value.length;
    if (page.value.length < pageSize) break; // upstream returned fewer than requested = end
  }

  return { ok: true, value: rows };
}
