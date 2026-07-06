/**
 * Repo-map call-site signal (#4268, enhancement of #4254 / epic #4251).
 *
 * Turns the `search_usages` ast-grep machinery (#4265, shared via
 * `indexer/usage-ast.ts`) into a per-module **call-site frequency** signal the
 * repo-map ranker blends with import-graph PageRank, so ranking reflects which
 * modules are actually *called*, not just imported.
 *
 * ## Cost bound (call-site extraction is heavier than the import graph)
 *
 * The signal is deliberately bounded so a flag-on structural call cannot blow
 * the per-call budget or add unbounded latency:
 *  1. **Probe symbols come only from the TOP-N import-ranked modules**
 *     ({@link CALLSITE_TOP_N_MODULES}); the whole probe set is capped at
 *     {@link MAX_PROBE_SYMBOLS}.
 *  2. **Each source file is parsed at most ONCE** — {@link countCallSitesInSource}
 *     tallies every probe symbol in a single parse (not one parse per symbol).
 *  3. **Total files scanned is capped** at {@link MAX_CALLSITE_FILES}.
 *
 * Best-effort: any read/parse failure degrades to a partial/empty count (the
 * ranker then falls back toward import-only ordering) — it never throws into
 * context assembly.
 *
 * @module context/repo-map-callsites
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CodebaseIndex, ModuleEntry } from '../indexer/types.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import { countCallSitesInSource, inferLang } from '../indexer/usage-ast.js';

/** How many top import-ranked modules contribute probe symbols. */
export const CALLSITE_TOP_N_MODULES = 25;
/** Hard cap on the total number of probe symbols scanned per repo-map build. */
export const MAX_PROBE_SYMBOLS = 60;
/** Hard cap on files parsed per repo-map build, to bound worst-case latency. */
export const MAX_CALLSITE_FILES = 4000;

/** Options for {@link computeCallSiteCounts}. */
export interface CallSiteCountOptions {
  /**
   * Root the index's relative file paths resolve against. Defaults to
   * `<cwd>/src`, matching the default index provider (`extractProject` rootDir).
   */
  readonly sourceRoot?: string;
  /** Cap on files parsed. Defaults to {@link MAX_CALLSITE_FILES}. */
  readonly maxFiles?: number;
  /** Optional logger override. */
  readonly logger?: ILogger;
}

/** The bounded probe: the tracked symbols + which module each belongs to. */
interface ProbeSet {
  readonly symbols: ReadonlySet<string>;
  readonly owner: ReadonlyMap<string, string>;
}

interface FileRef {
  readonly abs: string;
  readonly rel: string;
}

function defaultSourceRoot(): string {
  return resolve(process.cwd(), 'src');
}

/** Add a module's own (non-re-exported) symbol names to the probe owner map. */
function addModuleExports(mod: ModuleEntry, name: string, owner: Map<string, string>): void {
  for (const file of mod.files) {
    for (const exp of file.exports) {
      if (exp.isReExport) continue;
      if (!owner.has(exp.name)) owner.set(exp.name, name);
      if (owner.size >= MAX_PROBE_SYMBOLS) return;
    }
  }
}

/** Build the bounded probe set from the top import-ranked modules' exports. */
function buildProbeSet(index: CodebaseIndex, topModuleNames: readonly string[]): ProbeSet {
  const owner = new Map<string, string>();
  for (const name of topModuleNames) {
    const mod = index.modules[name];
    if (mod === undefined) continue;
    addModuleExports(mod, name, owner);
    if (owner.size >= MAX_PROBE_SYMBOLS) break;
  }
  return { symbols: new Set(owner.keys()), owner };
}

/** Deduplicated, capped list of every source file the index knows about. */
function collectFiles(index: CodebaseIndex, sourceRoot: string, maxFiles: number): FileRef[] {
  const refs: FileRef[] = [];
  const seen = new Set<string>();
  for (const mod of Object.values(index.modules)) {
    for (const file of mod.files) {
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      refs.push({ abs: resolve(sourceRoot, file.path), rel: file.path });
      if (refs.length >= maxFiles) return refs;
    }
  }
  return refs;
}

/** Parse one file once and fold its probe-symbol call-sites into per-module counts. */
function tallyFile(probe: ProbeSet, ref: FileRef, counts: Map<string, number>, log: ILogger): void {
  let src: string;
  try {
    src = readFileSync(ref.abs, 'utf8');
  } catch {
    log.debug('repo-map call-site: unreadable file', { file: ref.rel });
    return;
  }
  for (const [sym, n] of countCallSitesInSource(probe.symbols, src, inferLang(ref.rel))) {
    const owner = probe.owner.get(sym);
    if (owner !== undefined) counts.set(owner, (counts.get(owner) ?? 0) + n);
  }
}

/**
 * Count structural call-sites of the top import-ranked modules' exported
 * symbols across the codebase, returning a `module → call-site count` map used
 * as a secondary rank signal (#4268). Bounded per the module docstring and
 * best-effort — a failure yields a partial/empty map, never a throw.
 */
export function computeCallSiteCounts(
  index: CodebaseIndex,
  topModuleNames: readonly string[],
  options: CallSiteCountOptions = {}
): Map<string, number> {
  const log = options.logger ?? createLogger({ component: 'RepoMapCallSites' });
  const counts = new Map<string, number>();
  try {
    const probe = buildProbeSet(index, topModuleNames);
    if (probe.symbols.size === 0) return counts;
    const sourceRoot = options.sourceRoot ?? defaultSourceRoot();
    const maxFiles = options.maxFiles ?? MAX_CALLSITE_FILES;
    for (const ref of collectFiles(index, sourceRoot, maxFiles)) {
      tallyFile(probe, ref, counts, log);
    }
  } catch (error: unknown) {
    log.debug('repo-map call-site counting failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return counts;
}
