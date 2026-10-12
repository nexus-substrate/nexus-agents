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

import { filterAdmittedModels } from '../packages/nexus-agents/src/config/model-catalog-admission.js';
import {
  fetchCatalog,
  MODELS_DEV_URL,
} from '../packages/nexus-agents/src/config/models-dev-client.js';
import type { ModelsDevSnapshot } from '../packages/nexus-agents/src/config/models-dev-snapshot-loader.js';

const SNAPSHOT_PATH = join(ROOT, 'packages/nexus-agents/src/config/models-dev-snapshot.json');

export { fetchCatalog, type ModelsDevSnapshot };

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
