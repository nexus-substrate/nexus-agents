/**
 * models.dev sync script (#2547 4b, #7072).
 *
 * Fetches the models.dev catalog as a one-shot snapshot and writes it
 * to `packages/nexus-agents/src/config/models-dev-snapshot.json`. The
 * registry loads the snapshot at boot as tier 3 of the resolution
 * chain (lower priority than in-tree authoritative entries; higher
 * priority than derived fallbacks).
 *
 * Increment C of Epic #4391 (#7072):
 *   - SSRF protection on URL fetch
 *   - Payload size ceiling and strict schema validation
 *   - Preserves provider × model coverage in snapshot
 *   - Enforces gateway-reachability admission: admits models only if
 *     covered by configured gateways or explicit pins (never all 6,250)
 *
 * Usage:
 *   pnpm exec tsx scripts/sync-models-dev.ts          # fetch + write
 *   pnpm exec tsx scripts/sync-models-dev.ts --check  # fail if drift exists
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';

import {
  validateCatalogFetchUrl,
  validateCatalogPayloadSize,
  parseModelsDevCatalog,
  filterAdmittedModels,
  type ModelsDevCatalog,
} from '../packages/nexus-agents/src/config/model-catalog-admission.js';
import type { ModelsDevSnapshot } from '../packages/nexus-agents/src/config/models-dev-snapshot-loader.js';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const SNAPSHOT_PATH = join(ROOT, 'packages/nexus-agents/src/config/models-dev-snapshot.json');
const FETCH_TIMEOUT_MS = 20_000;

export { type ModelsDevSnapshot };

function checkContentLengthHeader(headers: Headers): void {
  const contentLength = headers.get('content-length');
  if (contentLength === null) return;
  const parsedBytes = parseInt(contentLength, 10);
  if (!Number.isFinite(parsedBytes)) return;
  const sizeCheck = validateCatalogPayloadSize(parsedBytes);
  if (!sizeCheck.ok) {
    throw new Error(`Catalog fetch rejected: ${sizeCheck.error}`);
  }
}

function parseRawCatalogJson(text: string): ModelsDevCatalog {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e: unknown) {
    throw new Error(
      `Catalog response is not valid JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const parsed = parseModelsDevCatalog(raw);
  if (!parsed.ok) {
    throw new Error(`Catalog schema validation rejected input: ${parsed.error}`);
  }
  return parsed.data;
}

/**
 * Fetch catalog with SSRF check, payload size limit, and strict schema validation.
 */
export async function fetchCatalog(url: string = MODELS_DEV_URL): Promise<ModelsDevCatalog> {
  const urlCheck = validateCatalogFetchUrl(url);
  if (!urlCheck.ok) {
    throw new Error(`SSRF check refused catalog URL: ${urlCheck.error}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(urlCheck.url.toString(), { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`models.dev returned HTTP ${String(response.status)}`);
    }

    checkContentLengthHeader(response.headers);

    const arrayBuffer = await response.arrayBuffer();
    const sizeCheck = validateCatalogPayloadSize(arrayBuffer.byteLength);
    if (!sizeCheck.ok) {
      throw new Error(`Catalog fetch rejected: ${sizeCheck.error}`);
    }

    const text = new TextDecoder().decode(arrayBuffer);
    return parseRawCatalogJson(text);
  } finally {
    clearTimeout(timer);
  }
}

export function serializeSnapshot(snapshot: ModelsDevSnapshot): string {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

function resolveStabilizedSnapshot(next: ModelsDevSnapshot, checkMode: boolean): ModelsDevSnapshot {
  if (checkMode && existsSync(SNAPSHOT_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as ModelsDevSnapshot;
      if (typeof existing.fetchedAt === 'string') {
        return {
          ...next,
          fetchedAt: existing.fetchedAt,
        };
      }
    } catch {
      // Drift detection will catch parse errors below
    }
  }
  return next;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');

  console.log(`Fetching ${MODELS_DEV_URL} …`);
  const catalog = await fetchCatalog();
  const { admittedEntries, gatewaysByModel } = filterAdmittedModels(catalog, {
    configuredGateways: ['claude', 'codex', 'gemini', 'opencode'],
  });
  console.log(`Mapped ${String(admittedEntries.length)} entries across admitted gateways.`);

  const fetchedAt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const candidateSnapshot: ModelsDevSnapshot = {
    version: 1,
    fetchedAt,
    sourceUrl: MODELS_DEV_URL,
    entries: admittedEntries,
    gatewaysByModel,
  };

  const snapshot = resolveStabilizedSnapshot(candidateSnapshot, checkMode);
  const next = serializeSnapshot(snapshot);

  if (checkMode) {
    const existing = existsSync(SNAPSHOT_PATH) ? readFileSync(SNAPSHOT_PATH, 'utf-8') : '';
    if (existing !== next) {
      console.error('models-dev-snapshot.json is stale.');
      console.error('Run `pnpm exec tsx scripts/sync-models-dev.ts` and commit the result.');
      process.exit(1);
    }
    console.log('Snapshot is up to date.');
    return;
  }

  writeFileSync(SNAPSHOT_PATH, next, 'utf-8');
  console.log(`Wrote ${SNAPSHOT_PATH} (${String(admittedEntries.length)} entries).`);
}

if (process.argv[1]?.endsWith('sync-models-dev.ts') === true) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exit(1);
  });
}
