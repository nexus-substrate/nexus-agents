/**
 * check-registry-coverage.ts — enforce wiring-completeness for behavioral registries.
 *
 * When a source file declared in registry-coverage-manifest.json changes in a way
 * that touches the registry's marker, every peer file MUST also change in the same
 * PR. Catches the class of bug from #2347 / #2344 / #2358 / #2315 — registry entry
 * added but peer files (schema, MCP tool, contract test, etc.) miss the update.
 *
 * Hard-fail in v1; no escape hatch. If a registry change genuinely doesn't need a
 * peer-file update, the manifest is wrong; fix the manifest in the same PR.
 *
 * See docs/architecture/REGISTRY_COVERAGE.md (#2405). Implements #2406.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-registry-coverage.ts            # Check for violations
 *   pnpm exec tsx scripts/check-registry-coverage.ts --verbose  # Detailed output
 *
 * Exit codes:
 *   0 - No violations
 *   1 - Violation detected
 */

/* eslint-disable no-console */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'docs/ops/registry-coverage-manifest.json');

interface RegistryEntry {
  readonly name: string;
  readonly source: string;
  readonly marker: string;
  readonly peer_files: readonly string[];
  readonly rationale: string;
  /**
   * Registry relocation (#3566): when the marker list MOVED here from another
   * file, the structural-equivalence exemption can't compare against this
   * source's base (it didn't exist at base). If set, the exemption compares the
   * current list against the marker list at the BASE of `moved_from` instead, so
   * a pure no-op relocation doesn't falsely demand peer-file updates. Only used
   * while `source` is absent at base (i.e. the relocation PR itself).
   */
  readonly moved_from?: string;
  /** Marker name at the `moved_from` location, if it differed (default: `marker`). */
  readonly moved_from_marker?: string;
  /**
   * Opt-in content check (#5222). Without it, the peer requirement is set
   * membership: ANY edit to the peer satisfies it, so adding `NEXUS_FOO` to
   * env-schema.ts and fixing an unrelated typo in CONFIGURATION.md passes with
   * `NEXUS_FOO` documented nowhere. Those differ exactly in the case the gate
   * was built for.
   *
   * `extract` is a regex naming the identifiers a source change introduces.
   * Identifiers ADDED by this PR must then appear in every peer file.
   * Per-registry and optional, so opting one in cannot change the others.
   */
  readonly peer_mentions?: { readonly extract: string };
}

interface RegistryManifest {
  readonly version: string;
  readonly description?: string;
  readonly registries: readonly RegistryEntry[];
}

interface Violation {
  readonly registry: RegistryEntry;
  readonly missing_peers: readonly string[];
  /** Added identifiers absent from a peer that WAS changed (#5222). */
  readonly undocumented?: readonly { readonly peer: string; readonly missing: readonly string[] }[];
}

// ============================================================================
// Git helpers
// ============================================================================

/**
 * Validate GITHUB_BASE_REF before passing it to git. Allowlist limits the
 * value to git-ref-safe characters; even though execFileSync (no shell) makes
 * command injection impossible by construction, this also rejects malformed
 * values that would silently fail at the git boundary.
 */
function safeBaseRef(): string | null {
  const raw = process.env['GITHUB_BASE_REF'];
  if (raw === undefined || raw === '') return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(raw)) return null;
  return raw;
}

/**
 * Get the list of files changed in the current PR (or HEAD~1 fallback).
 * Walks the PR commit range when GITHUB_BASE_REF is set so the diff captures
 * every commit on the branch (lesson from #2411 — actions/checkout's PR-merge
 * ref puts a synthetic merge commit at HEAD).
 *
 * Uses execFileSync with argv arrays (no shell) per security review on PR
 * #2421.
 */
export function getChangedFiles(cwd: string = REPO_ROOT): string[] {
  const baseRef = safeBaseRef();
  const range = baseRef !== null ? `origin/${baseRef}...HEAD` : 'HEAD~1...HEAD';
  try {
    const out = execFileSync('git', ['diff', '--name-only', range], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch {
    // Fall back to staged files (covers local pre-commit usage).
    try {
      const staged = execFileSync('git', ['diff', '--cached', '--name-only'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return staged
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }
}

/**
 * Get the diff content for a specific file across the PR range.
 * Returns the unified diff so the caller can detect marker-line touches.
 */
export function getFileDiff(filePath: string, cwd: string = REPO_ROOT): string {
  const baseRef = safeBaseRef();
  const range = baseRef !== null ? `origin/${baseRef}...HEAD` : 'HEAD~1...HEAD';
  try {
    return execFileSync('git', ['diff', range, '--', filePath], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/**
 * Get the OLD content of a file (pre-image of the PR). Used by the
 * structural-change exemption to compare the marker-array contents
 * before and after — if they're identical, the marker touch is
 * cosmetic (export keyword, comment edit, formatting) and the gate
 * should not fire (#2935).
 */
export function getFileAtBase(filePath: string, cwd: string = REPO_ROOT): string | null {
  const baseRef = safeBaseRef();
  const ref = baseRef !== null ? `origin/${baseRef}` : 'HEAD~1';
  try {
    return execFileSync('git', ['show', `${ref}:${filePath}`], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * Extract the list of string-literal entries from the first `<marker> = [ ... ]`
 * block in `content`. Returns a sorted, de-duplicated list of entries, or `null`
 * if the marker block can't be parsed.
 *
 * Conservative by design: any extraction failure falls back to the line-based
 * detection rather than incorrectly skipping a real violation.
 */
export function extractMarkerEntries(content: string, marker: string): readonly string[] | null {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
  const match = re.exec(content);
  const inner = match?.[1];
  if (inner === undefined) return null;
  const literals = [...inner.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
  if (literals.length === 0) return null;
  return [...new Set(literals)].sort();
}

// ============================================================================
// Manifest loading + validation
// ============================================================================

export function loadManifest(): RegistryManifest | null {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`✗ Registry-coverage manifest not found: ${MANIFEST_PATH}`);
    return null;
  }
  try {
    const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(content) as RegistryManifest;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`✗ Failed to parse manifest: ${message}`);
    return null;
  }
}

/** Verify every manifest path actually exists (catches bitrot). */
export function validateManifest(manifest: RegistryManifest): readonly string[] {
  const errors: string[] = [];
  for (const reg of manifest.registries) {
    if (!fs.existsSync(path.join(REPO_ROOT, reg.source))) {
      errors.push(`${reg.name}: source missing → ${reg.source}`);
    }
    for (const peer of reg.peer_files) {
      if (!fs.existsSync(path.join(REPO_ROOT, peer))) {
        errors.push(`${reg.name}: peer missing → ${peer}`);
      }
    }
    // #5222: an uncompilable `extract` would make the mention check throw at the
    // point of use, mid-run, after other registries had already been judged.
    // Catch it here with the other bitrot so the manifest is rejected whole.
    if (reg.peer_mentions !== undefined) {
      try {
        new RegExp(reg.peer_mentions.extract, 'g');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${reg.name}: peer_mentions.extract is not a valid regex → ${message}`);
      }
    }
  }
  return errors;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Was the registry's marker block touched by the PR diff?
 *
 * Two-stage detection (#2935 hardened the v1 line-based rule):
 *
 * 1. **Line check** — if no added/removed diff line contains the marker
 *    token, the registry is unchanged. Same as v1.
 * 2. **Structural-equivalence exemption** — if the diff DOES touch the
 *    marker, extract the array contents from both pre-image and post-image
 *    of the source file. If the sorted, de-duplicated list of string
 *    literals is identical, the touch was cosmetic (export keyword,
 *    comment edit, formatting) — not a real registry change — and the
 *    gate should not fire. Falls back to line-based detection if either
 *    extraction fails (conservative: prefer false-positive over
 *    false-negative for a wiring-completeness gate).
 */
export function isRegistryChanged(
  registry: RegistryEntry,
  changedFiles: readonly string[],
  diffOf: (path: string) => string = getFileDiff,
  baseOf: (path: string) => string | null = getFileAtBase,
  currentOf: (path: string) => string | null = readWorkingTree
): boolean {
  if (!changedFiles.includes(registry.source)) return false;
  if (!markerLineTouched(diffOf(registry.source), registry.marker)) return false;
  return !structurallyEquivalent(registry, baseOf, currentOf);
}

/** Did any added/removed line in the diff contain the marker token? */
function markerLineTouched(diff: string, marker: string): boolean {
  for (const line of diff.split('\n')) {
    if ((line.startsWith('+') || line.startsWith('-')) && line.includes(marker)) {
      return true;
    }
  }
  return false;
}

/**
 * Did the marker-array contents survive the diff unchanged? Returns false
 * (and the caller treats the diff as a real change) if either side fails
 * to parse — conservative default for a wiring-completeness gate.
 */
function structurallyEquivalent(
  registry: RegistryEntry,
  baseOf: (path: string) => string | null,
  currentOf: (path: string) => string | null
): boolean {
  const newContent = currentOf(registry.source);
  if (newContent === null) return false;

  // Normal case: compare against this source's base. Relocation case (#3566):
  // if the source didn't exist at base, compare against the base of the file the
  // list moved from, using its pre-move marker name.
  let oldContent = baseOf(registry.source);
  let oldMarker = registry.marker;
  if (oldContent === null && registry.moved_from !== undefined) {
    oldContent = baseOf(registry.moved_from);
    oldMarker = registry.moved_from_marker ?? registry.marker;
  }
  if (oldContent === null) return false;

  const before = extractMarkerEntries(oldContent, oldMarker);
  const after = extractMarkerEntries(newContent, registry.marker);
  if (before === null || after === null) return false;
  return arraysEqual(before, after);
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Read the working-tree copy of a repo-relative path, or null on error. */
function readWorkingTree(filePath: string): string | null {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, filePath), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Outcome of the peer-mention check for one registry (#5222).
 *
 * A discriminated union so a caller cannot read `undocumented` without first
 * narrowing on `evaluated`. "Nothing was added, so nothing was checked" and
 * "everything added is documented" are different states, and collapsing them
 * would report a pass over an empty collection.
 */
export type PeerMentionCheck =
  | { readonly evaluated: false; readonly reason: 'no-identifiers-added' }
  | {
      readonly evaluated: true;
      readonly undocumented: readonly {
        readonly peer: string;
        readonly missing: readonly string[];
      }[];
    };

/**
 * Identifiers this diff ADDS, per `pattern`.
 *
 * Added means "on a `+` line and not on a `-` line", so a rename or a
 * reformatted line nets to nothing. Removals are deliberately out of scope:
 * asserting that a deleted variable is ALSO gone from the docs is a different
 * check with different failure modes, and conflating them is how the empty case
 * ends up answered by a language default.
 *
 * `+++`/`---` headers are skipped — they carry file paths, and a path like
 * `b/NEXUS_THING.ts` would otherwise be read as an added identifier.
 */
export function extractAddedIdentifiers(diff: string, pattern: string): readonly string[] {
  const re = new RegExp(pattern, 'g');
  const added = new Set<string>();
  const removed = new Set<string>();

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    const target = line.startsWith('+') ? added : line.startsWith('-') ? removed : null;
    if (target === null) continue;
    for (const found of line.slice(1).match(re) ?? []) target.add(found);
  }

  for (const gone of removed) added.delete(gone);
  return [...added].sort();
}

/**
 * Whether every added identifier appears in every peer file.
 *
 * Returns `evaluated: false` when the diff added nothing — a pure removal,
 * rename or reordering. That case has nothing to assert, so it reports
 * unmeasured and the caller falls back to the existing changed-file
 * requirement. Reporting a pass there would be the vacuous verdict this repo
 * treats as a p1 on the governor path.
 *
 * An unreadable peer counts as undocumented rather than satisfied: a file that
 * cannot be read is no evidence of documentation, and the read failure mode
 * (renamed or deleted peer) is exactly when the docs are most likely wrong.
 */
export function checkPeerMentions(
  added: readonly string[],
  peerContents: ReadonlyMap<string, string | null>
): PeerMentionCheck {
  if (added.length === 0) return { evaluated: false, reason: 'no-identifiers-added' };

  const undocumented: { peer: string; missing: readonly string[] }[] = [];
  for (const [peer, content] of peerContents) {
    // `!== true` rather than `!content?.includes(id)`: the optional chain
    // yields `boolean | undefined`, and an unreadable peer (undefined) must
    // count as MISSING, which this states explicitly.
    const missing = added.filter((id) => content?.includes(id) !== true);
    if (missing.length > 0) undocumented.push({ peer, missing });
  }
  return { evaluated: true, undocumented };
}

/** Find peer files declared by the registry that are NOT in the changed-files set. */
export function findMissingPeers(
  registry: RegistryEntry,
  changedFiles: readonly string[]
): readonly string[] {
  const changed = new Set(changedFiles);
  return registry.peer_files.filter((p) => !changed.has(p));
}

// ============================================================================
// Reporting
// ============================================================================

function printVerboseInfo(manifest: RegistryManifest, changed: readonly string[]): void {
  console.log(`Manifest version: ${manifest.version}`);
  console.log(`Registries: ${String(manifest.registries.length)}`);
  console.log(`Changed files: ${String(changed.length)}`);
  changed.slice(0, 20).forEach((f) => {
    console.log(`  - ${f}`);
  });
  if (changed.length > 20) console.log(`  … (${String(changed.length - 20)} more)`);
  console.log('');
}

function printViolation(v: Violation): void {
  console.log(`✗ VIOLATION: ${v.registry.name}`);
  console.log(`  Source: ${v.registry.source}`);
  console.log(`  Rationale: ${v.registry.rationale}`);

  if (v.missing_peers.length > 0) {
    console.log(`  Missing peer files (must also be updated in this PR):`);
    for (const peer of v.missing_peers) {
      console.log(`    - ${peer}`);
    }
  }

  // #5222: the peer WAS changed, so the old message ("update the peer") would
  // have told the author to do something they already did. Name the identifier.
  for (const u of v.undocumented ?? []) {
    console.log(`  ${u.peer} was changed but does not mention:`);
    for (const id of u.missing) {
      console.log(`    - ${id}`);
    }
  }
  console.log('');
}

// ============================================================================
// Main
// ============================================================================

interface CheckResult {
  readonly success: boolean;
  readonly violations: readonly Violation[];
  readonly bitrot_errors: readonly string[];
  /**
   * Set when the manifest declared ZERO registries (#4586).
   *
   * The verdict is `violations.length === 0`, which an empty manifest
   * satisfies: emptying `registries` made the gate green while inspecting
   * nothing. `validateManifest` cannot catch it either — its bitrot loop has
   * no entries to check. Absence of evidence is not evidence of coverage, so
   * this reports `unmeasured` and fails.
   */
  readonly unmeasured?: boolean;
}

/**
 * Whether a manifest declaring this many registries can support a verdict
 * (#4586).
 *
 * Extracted so the empty case is testable without a repo on disk. Zero
 * registries means nothing was inspected: `violations.length === 0` is
 * satisfied trivially, and `validateManifest`'s bitrot loop has no entries to
 * catch it, so emptying the manifest made the gate green.
 */
export function isUnmeasurableManifest(registryCount: number): boolean {
  return registryCount === 0;
}

/**
 * Content half of the peer requirement for one opted-in registry (#5222).
 *
 * Returns `null` when there is nothing to report — no opt-in, an unmeasured
 * extraction, or everything documented. Only the caller's changed-file check
 * has run at this point, and it passed, so `null` means the registry is clean.
 */
function findUndocumentedMentions(registry: RegistryEntry, verbose: boolean): Violation | null {
  const mentions = registry.peer_mentions;
  if (mentions === undefined) return null;

  const added = extractAddedIdentifiers(getFileDiff(registry.source), mentions.extract);
  const peerContents = new Map<string, string | null>(
    registry.peer_files.map((peer) => [peer, readWorkingTree(peer)])
  );
  const result = checkPeerMentions(added, peerContents);

  if (!result.evaluated) {
    // Unmeasured, NOT a pass. The changed-file requirement already held, and
    // that is the whole verdict for this registry in this PR.
    if (verbose) {
      console.log(
        `  ${registry.name}: mention check unmeasured (${result.reason}) — ` +
          `falling back to the changed-file requirement, which passed`
      );
    }
    return null;
  }

  if (result.undocumented.length === 0) return null;
  return { registry, missing_peers: [], undocumented: result.undocumented };
}

export function performCheck(verbose: boolean): CheckResult {
  const manifest = loadManifest();
  if (manifest === null) {
    return { success: false, violations: [], bitrot_errors: [] };
  }

  if (isUnmeasurableManifest(manifest.registries.length)) {
    return { success: false, violations: [], bitrot_errors: [], unmeasured: true };
  }

  const bitrotErrors = validateManifest(manifest);
  if (bitrotErrors.length > 0) {
    return { success: false, violations: [], bitrot_errors: bitrotErrors };
  }

  const changedFiles = getChangedFiles();
  if (verbose) printVerboseInfo(manifest, changedFiles);

  const violations: Violation[] = [];
  for (const registry of manifest.registries) {
    if (!isRegistryChanged(registry, changedFiles)) continue;

    const missing = findMissingPeers(registry, changedFiles);
    if (missing.length > 0) {
      // The peer was not touched at all. The mention check would add nothing
      // here beyond a second way of saying the same thing.
      violations.push({ registry, missing_peers: missing });
      continue;
    }

    // Every peer was touched. #5222: that proves an edit happened, not that the
    // edit documents anything, so opted-in registries also check content.
    const undocumentedViolation = findUndocumentedMentions(registry, verbose);
    if (undocumentedViolation !== null) violations.push(undocumentedViolation);
  }

  return { success: violations.length === 0, violations, bitrot_errors: [] };
}

function checkRegistryCoverage(verbose: boolean): boolean {
  console.log('Registry-Coverage Check (#2406)');
  console.log('================================\n');

  const result = performCheck(verbose);

  if (result.unmeasured === true) {
    console.error('✗ Registry-coverage UNMEASURED — the manifest declares zero registries.\n');
    console.error('  Nothing was inspected, so nothing can be said to be covered. Emptying');
    console.error('  `registries` used to make this gate green (#4586).');
    console.error('  Restore docs/ops/registry-coverage-manifest.json.');
    return false;
  }

  if (result.bitrot_errors.length > 0) {
    console.error('✗ Manifest bitrot detected (paths in manifest do not exist on disk):\n');
    for (const e of result.bitrot_errors) {
      console.error(`  ${e}`);
    }
    console.error('');
    console.error('Fix the manifest at docs/ops/registry-coverage-manifest.json.');
    return false;
  }

  if (result.success) {
    console.log('✓ No registry-coverage violations.\n');
    return true;
  }

  console.log(`✗ ${String(result.violations.length)} registry-coverage violation(s) detected.\n`);
  for (const v of result.violations) {
    printViolation(v);
  }

  console.log('To resolve:');
  console.log('  1. Update the missing peer files in the same PR, OR');
  console.log(
    '  2. Update docs/ops/registry-coverage-manifest.json if the peer is no longer required.'
  );
  console.log('');
  console.log('See: docs/architecture/REGISTRY_COVERAGE.md\n');
  return false;
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
check-registry-coverage.ts — enforce wiring-completeness for behavioral registries

Usage:
  pnpm exec tsx scripts/check-registry-coverage.ts [options]

Options:
  --verbose, -v  Show detailed output
  --help, -h     Show this help

Exit codes:
  0 - No violations
  1 - Violation detected
`);
    process.exit(0);
  }

  const success = checkRegistryCoverage(verbose);
  process.exit(success ? 0 : 1);
}

const invokedDirectly = process.argv[1]?.endsWith('check-registry-coverage.ts') === true;
if (invokedDirectly) {
  main();
}
