#!/usr/bin/env -S npx tsx
/**
 * build-model-registry — Build-time generator for the T2 bundled model registry
 * (epic #2174, child issue #2175).
 *
 * Fetches upstream model metadata from models.dev + LiteLLM, validates it
 * against Zod schemas with `.passthrough()` for forward-compat, enforces
 * payload + sanity bounds (supply-chain rails), trims to the fields the
 * codebase actually consumes, tags each entry with provenance, and writes
 * packages/nexus-agents/src/config/model-registry.generated.json.
 *
 * No runtime path in the application ever fetches from the network — this
 * script is invoked only at build/CI time (#2180) or manually via
 * `pnpm build:registry`.
 *
 * Usage:
 *   npx tsx scripts/build-model-registry.ts           # write the generated JSON
 *   npx tsx scripts/build-model-registry.ts --dry     # parse + validate, print counts
 *   npx tsx scripts/build-model-registry.ts --offline # use last-committed snapshot, no fetch
 */
/* eslint-disable no-console, max-lines-per-function, complexity */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { SRC_ROOT } from './script-paths.js';
import { mergeEntries, parseLiteLlm, parseModelsDev } from './build-model-registry-helpers.js';
import type {
  GeneratedModelEntry,
  GeneratedRegistry,
  LiteLlmResponse,
  ModelsDevResponse,
} from './build-model-registry-types.js';
import {
  GeneratedRegistrySchema,
  LiteLlmResponseSchema,
  MAX_UPSTREAM_PAYLOAD_BYTES,
  ModelsDevResponseSchema,
} from './build-model-registry-types.js';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const OUTPUT_PATH = join(SRC_ROOT, 'config/model-registry.generated.json');

// ---------------------------------------------------------------------------
// Fetch with size cap
// ---------------------------------------------------------------------------

interface FetchResult {
  readonly ok: boolean;
  readonly body?: string;
  readonly error?: string;
}

async function fetchWithSizeCap(url: string): Promise<FetchResult> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${String(response.status)} from ${url}` };
    }
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null) {
      const declared = Number.parseInt(contentLength, 10);
      if (Number.isFinite(declared) && declared > MAX_UPSTREAM_PAYLOAD_BYTES) {
        return {
          ok: false,
          error: `upstream declared size ${String(declared)} exceeds cap ${String(MAX_UPSTREAM_PAYLOAD_BYTES)}`,
        };
      }
    }
    const body = await response.text();
    if (body.length > MAX_UPSTREAM_PAYLOAD_BYTES) {
      return {
        ok: false,
        error: `payload size ${String(body.length)} exceeds cap ${String(MAX_UPSTREAM_PAYLOAD_BYTES)}`,
      };
    }
    return { ok: true, body };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Parse with schema validation
// ---------------------------------------------------------------------------

function parseWithSchema<T>(body: string, schema: z.ZodType<T>, sourceUrl: string): T | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[registry-build] JSON parse failed for ${sourceUrl}: ${message}`);
    return undefined;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      `[registry-build] schema validation failed for ${sourceUrl}: ${parsed.error.message}`
    );
    return undefined;
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Main orchestration
// ---------------------------------------------------------------------------

interface RunOptions {
  readonly dry: boolean;
  readonly offline: boolean;
}

async function run(options: RunOptions): Promise<number> {
  const fetchedAt = new Date().toISOString();

  console.log('[registry-build] starting build-model-registry');
  console.log(`[registry-build] dry=${String(options.dry)} offline=${String(options.offline)}`);

  let modelsDev: ModelsDevResponse | undefined;
  let liteLlm: LiteLlmResponse | undefined;

  if (!options.offline) {
    const modelsDevResult = await fetchWithSizeCap(MODELS_DEV_URL);
    if (modelsDevResult.ok && modelsDevResult.body !== undefined) {
      modelsDev = parseWithSchema(modelsDevResult.body, ModelsDevResponseSchema, MODELS_DEV_URL);
    } else {
      console.warn(
        `[registry-build] models.dev fetch failed: ${modelsDevResult.error ?? 'unknown'}`
      );
    }

    const liteLlmResult = await fetchWithSizeCap(LITELLM_URL);
    if (liteLlmResult.ok && liteLlmResult.body !== undefined) {
      liteLlm = parseWithSchema(liteLlmResult.body, LiteLlmResponseSchema, LITELLM_URL);
    } else {
      console.warn(`[registry-build] LiteLLM fetch failed: ${liteLlmResult.error ?? 'unknown'}`);
    }
  }

  if (modelsDev === undefined && liteLlm === undefined) {
    if (existsSync(OUTPUT_PATH)) {
      console.warn(
        '[registry-build] both upstream sources unavailable; retaining last-committed snapshot'
      );
      return 0;
    }
    console.error(
      '[registry-build] both upstream sources unavailable and no existing snapshot to retain'
    );
    return 1;
  }

  const ctx = { fetchedAt };
  const modelsDevEntries = modelsDev !== undefined ? parseModelsDev(modelsDev, ctx) : [];
  const liteLlmEntries = liteLlm !== undefined ? parseLiteLlm(liteLlm, ctx) : [];

  console.log(
    `[registry-build] parsed: models.dev=${String(modelsDevEntries.length)} litellm=${String(liteLlmEntries.length)}`
  );

  const merged = mergeEntries(modelsDevEntries, liteLlmEntries);
  console.log(
    `[registry-build] merged: ${String(merged.length)} entries (models.dev wins collisions)`
  );

  const registry = buildRegistry(merged, fetchedAt);
  const validated = GeneratedRegistrySchema.parse(registry);
  const json = `${JSON.stringify(validated, null, 2)}\n`;

  console.log(`[registry-build] output size: ${formatBytes(Buffer.byteLength(json))}`);
  console.log(`[registry-build] providers: ${summariseProviders(merged)}`);

  if (options.dry) {
    console.log(`[registry-build] dry run — not writing ${OUTPUT_PATH}`);
    return 0;
  }

  writeFileSync(OUTPUT_PATH, json, 'utf-8');
  console.log(`[registry-build] wrote ${OUTPUT_PATH}`);
  return 0;
}

function buildRegistry(
  entries: readonly GeneratedModelEntry[],
  fetchedAt: string
): GeneratedRegistry {
  return {
    version: 1,
    generatedAt: fetchedAt,
    entryCount: entries.length,
    entries: [...entries],
  };
}

// ---------------------------------------------------------------------------
// Observability helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function summariseProviders(entries: readonly GeneratedModelEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.provider, (counts.get(entry.provider) ?? 0) + 1);
  }
  const pairs = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return pairs.map(([p, n]) => `${p}=${String(n)}`).join(', ');
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function parseArgs(argv: readonly string[]): RunOptions {
  return {
    dry: argv.includes('--dry'),
    offline: argv.includes('--offline'),
  };
}

// Only run when invoked as a script (not when imported by tests).
if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const options = parseArgs(process.argv.slice(2));
  run(options)
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[registry-build] fatal: ${message}`);
      process.exit(1);
    });
}

export { buildRegistry, fetchWithSizeCap, parseWithSchema, run };
