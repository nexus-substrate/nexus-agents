/**
 * One-shot importer scaffold. Each Phase 4+ migration registers its own
 * importer here; the registry runs them on first launch (after a marker
 * file check) and renames source files to `.bak.<timestamp>` once
 * complete.
 *
 * This file ships the skeleton + the marker-file logic; concrete
 * importers (MobiMem JSON, OutcomeStore JSONL, agentic.db, etc.) plug in
 * during their respective migration phases.
 *
 * @module nexus-memory/importer
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MemoryRegistry } from './registry.js';

export interface ImporterRun {
  readonly domain: string;
  readonly rowsImported: number;
  readonly sourcePathBackup: string | null;
}

export interface Importer {
  /** Stable identifier — used in the marker filename to track completion. */
  readonly id: string;
  /** Logical domain this importer targets in the registry. */
  readonly domain: string;
  /**
   * Run the import. Implementations: (1) check if source data exists,
   * (2) parse + validate it, (3) write rows into the registry's backend,
   * (4) rename source to `.bak.<timestamp>` and return the backup path.
   * Idempotent — if marker file says we already ran, the registry skips it.
   */
  run(registry: MemoryRegistry): Promise<ImporterRun>;
}

const importers = new Map<string, Importer>();

/** Register an importer. Phase 4+ migrations call this at module load. */
export function registerImporter(importer: Importer): void {
  if (importers.has(importer.id)) {
    throw new Error(`nexus-memory: importer "${importer.id}" already registered`);
  }
  importers.set(importer.id, importer);
}

/** For tests: clear all registered importers. */
export function resetImporters(): void {
  importers.clear();
}

/** Snapshot of registered importer IDs. */
export function listImporters(): readonly string[] {
  return [...importers.keys()];
}

export interface RunImportersOptions {
  /**
   * Directory holding `.imported-{id}` marker files. Defaults to the
   * registry's data dir; tests should override.
   */
  readonly markerDir: string;
  /** Skip the marker check (forces re-run). Tests only. */
  readonly force?: boolean;
}

/**
 * Run every registered importer that hasn't yet completed (per marker
 * file). Returns the list of runs that actually executed.
 *
 * Failures are NOT fatal — a single importer's exception is logged via
 * the returned `errors` array; other importers still get a chance to run.
 */
export async function runImporters(
  registry: MemoryRegistry,
  options: RunImportersOptions
): Promise<{ runs: readonly ImporterRun[]; errors: readonly { id: string; error: Error }[] }> {
  mkdirSync(options.markerDir, { recursive: true });
  const runs: ImporterRun[] = [];
  const errors: { id: string; error: Error }[] = [];
  for (const importer of importers.values()) {
    const marker = join(options.markerDir, `.imported-${importer.id}`);
    if (options.force !== true && existsSync(marker)) continue;
    try {
      const run = await importer.run(registry);
      writeMarker(marker, run);
      runs.push(run);
    } catch (err) {
      errors.push({ id: importer.id, error: err instanceof Error ? err : new Error(String(err)) });
    }
  }
  return { runs, errors };
}

function writeMarker(path: string, run: ImporterRun): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ ...run, completedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  );
}

/**
 * Rename a source file to `.bak.<unix-timestamp>`. Used by concrete
 * importers after a successful migration. Returns the backup path, or
 * `null` when the source doesn't exist.
 */
export function backupSourceFile(sourcePath: string): string | null {
  if (!existsSync(sourcePath)) return null;
  const backup = `${sourcePath}.bak.${String(Date.now())}`;
  renameSync(sourcePath, backup);
  return backup;
}
