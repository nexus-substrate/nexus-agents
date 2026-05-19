/**
 * `nexus-agents migrate` — relocate homedir state into <repo>/.nexus-agents/
 * for users adopting the repo-preferred resolver from #2882.
 *
 * Copies (not moves) per-repo categorized subdirectories from
 * `~/.nexus-agents/` into `<repo>/.nexus-agents/`. Cross-repo state stays
 * homedir-scoped per the state-split contract codified in #2882's
 * `PER_REPO_SUBDIRS` allowlist — that's the source of truth, this command
 * reads from it via `getPerRepoSubdirs()` so the two stay in sync.
 *
 * Source: epic #2872, issue #2879, ratified by vote #2876.
 *
 * @module cli/migrate-command
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createLogger } from '../core/index.js';
import { getPerRepoSubdirs } from '../config/nexus-data-dir.js';
import { findRepoRoot } from '../config/repo-root-detection.js';

const logger = createLogger({ component: 'migrate-command' });

const HOMEDIR_DEFAULT_BASE = join(homedir(), '.nexus-agents');

/** Result of a single subdir migration. */
export interface SubdirMigration {
  readonly subdir: string;
  readonly status: 'copied' | 'skipped-empty' | 'skipped-exists' | 'skipped-not-per-repo';
  readonly source: string;
  readonly target: string;
  readonly itemsCopied: number;
}

/** Overall migration result. */
export interface MigrationResult {
  readonly fromBase: string;
  readonly toBase: string;
  readonly dryRun: boolean;
  readonly subdirs: readonly SubdirMigration[];
  readonly success: boolean;
  /** Human-readable summary line for stderr. */
  readonly summary: string;
}

/** Options accepted by `runMigrate`. */
export interface MigrateOptions {
  /** Override the source base (default: `~/.nexus-agents`). */
  readonly from?: string;
  /** Override the destination base (default: `<repo-root>/.nexus-agents`). */
  readonly to?: string;
  /** Override cwd (test injection). Default: `process.cwd()`. */
  readonly cwd?: string;
  /** Report the plan without writing. */
  readonly dryRun?: boolean;
}

/** Recursive count of leaf entries in a directory. Used for reporting. */
function countItems(dir: string): number {
  if (!existsSync(dir)) return 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    let n = 0;
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        n += countItems(p);
      } else {
        n += 1;
      }
    }
    return n;
  } catch {
    return 0;
  }
}

/**
 * Plans + executes the migration. Returns a structured result for the
 * CLI handler to format and the test suite to inspect.
 *
 * Safety:
 *   - Source is never modified (uses `cpSync` with default behavior).
 *   - Target subdirs that already contain state are SKIPPED (we don't
 *     merge or overwrite — that's a recipe for silent state corruption).
 *   - Empty source subdirs are SKIPPED.
 *   - Cross-repo subdirs in the source are SKIPPED with an explicit
 *     status so the operator can see what stayed in homedir.
 */
export function runMigrate(options: MigrateOptions = {}): MigrationResult {
  const fromBase = options.from ?? HOMEDIR_DEFAULT_BASE;
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const toBase = options.to ?? resolveDefaultTarget(cwd);

  const earlyExit = checkEarlyExits(fromBase, toBase, dryRun);
  if (earlyExit !== null) return earlyExit;

  const perRepoSet = getPerRepoSubdirs();
  const sourceEntries = readdirSync(fromBase, { withFileTypes: true });
  const subdirs: SubdirMigration[] = [];

  for (const entry of sourceEntries) {
    if (!entry.isDirectory()) continue;
    subdirs.push(planAndExecuteEntry(entry.name, fromBase, toBase as string, perRepoSet, dryRun));
  }

  const copied = subdirs.filter((s) => s.status === 'copied').length;
  const summary = dryRun
    ? `Dry run: would copy ${String(copied)} per-repo subdir(s) from ${fromBase} → ${String(toBase)}.`
    : `Copied ${String(copied)} per-repo subdir(s) from ${fromBase} → ${String(toBase)}.`;

  logger.info('Migration complete', { dryRun, copied, fromBase, toBase });

  return { fromBase, toBase: toBase as string, dryRun, subdirs, success: true, summary };
}

/**
 * Pre-loop validation: returns a `MigrationResult` for the no-op cases
 * (no target dir resolvable, source absent) and `null` to indicate the
 * main loop should proceed.
 */
function checkEarlyExits(
  fromBase: string,
  toBase: string | null,
  dryRun: boolean
): MigrationResult | null {
  if (toBase === null) {
    return {
      fromBase,
      toBase: '',
      dryRun,
      subdirs: [],
      success: false,
      summary:
        'No git repo detected from cwd. Run from inside a repo or pass --to <path> to choose an explicit destination.',
    };
  }
  if (!existsSync(fromBase)) {
    return {
      fromBase,
      toBase,
      dryRun,
      subdirs: [],
      success: true,
      summary: `No source state at ${fromBase}. Nothing to migrate.`,
    };
  }
  return null;
}

/**
 * Classifies and (if applicable) executes the migration of a single
 * source subdirectory. Returns the structured per-subdir result so
 * `runMigrate()` is a pure aggregator.
 */
function planAndExecuteEntry(
  name: string,
  fromBase: string,
  toBase: string,
  perRepoSet: ReadonlySet<string>,
  dryRun: boolean
): SubdirMigration {
  const source = join(fromBase, name);
  const target = join(toBase, name);

  if (!perRepoSet.has(name)) {
    return { subdir: name, status: 'skipped-not-per-repo', source, target: '', itemsCopied: 0 };
  }
  const items = countItems(source);
  if (items === 0) {
    return { subdir: name, status: 'skipped-empty', source, target, itemsCopied: 0 };
  }
  if (existsSync(target) && readdirSync(target).length > 0) {
    return { subdir: name, status: 'skipped-exists', source, target, itemsCopied: 0 };
  }
  if (!dryRun) {
    mkdirSync(toBase, { recursive: true });
    cpSync(source, target, { recursive: true, errorOnExist: false });
  }
  return { subdir: name, status: 'copied', source, target, itemsCopied: items };
}

/**
 * Resolves the default migration target: `<repo-root>/.nexus-agents/`
 * by walking upward from `cwd` for an ancestor `.git`. Returns `null`
 * when not inside a repo and `--to` wasn't provided.
 */
function resolveDefaultTarget(cwd: string): string | null {
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === null) return null;
  return join(repoRoot, '.nexus-agents');
}

/**
 * Formats the migration result for stderr output.
 * Kept pure so the test suite can assert against the rendered string.
 */
export function formatMigrationResult(result: MigrationResult): string {
  if (!result.success) {
    return `migrate: ${result.summary}\n`;
  }
  const lines: string[] = [];
  lines.push(result.summary);
  if (result.subdirs.length === 0) {
    return `${lines.join('\n')}\n`;
  }
  lines.push('');
  for (const s of result.subdirs) {
    const tag = s.status === 'copied' ? '✓' : '·';
    const detail =
      s.status === 'copied'
        ? `(${String(s.itemsCopied)} item(s))`
        : s.status === 'skipped-not-per-repo'
          ? '(cross-repo — kept in homedir)'
          : s.status === 'skipped-exists'
            ? '(destination already has state — skipped)'
            : '(empty source — skipped)';
    lines.push(`  ${tag} ${s.subdir} ${detail}`);
  }
  if (!result.dryRun && result.subdirs.some((s) => s.status === 'copied')) {
    lines.push('');
    lines.push('Next: export NEXUS_REPO_PREFERRED=1 to start using the per-repo data dir.');
    lines.push(
      'See: https://github.com/nexus-substrate/nexus-agents/issues/2872 for the full epic.'
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * CLI entry point. Reads `--dry-run` from args; honors `--from <path>`
 * and `--to <path>` overrides via the parsed args' generic `input` /
 * `output` slots (both flags are reused rather than adding bespoke
 * parser fields for a once-per-machine command).
 */
export async function handleMigrateCommand(args: {
  readonly options: {
    readonly dryRun?: boolean;
    readonly input?: string;
    readonly output?: string;
  };
}): Promise<void> {
  const opts: MigrateOptions = {
    ...(args.options.input !== undefined ? { from: args.options.input } : {}),
    ...(args.options.output !== undefined ? { to: args.options.output } : {}),
    ...(args.options.dryRun !== undefined ? { dryRun: args.options.dryRun } : {}),
  };
  const result = runMigrate(opts);
  process.stderr.write(formatMigrationResult(result));
  await Promise.resolve();
  if (!result.success) {
    process.exit(1);
  }
}

/** Re-export for the migrate command's CLI surface area. */
export { findRepoRoot };
