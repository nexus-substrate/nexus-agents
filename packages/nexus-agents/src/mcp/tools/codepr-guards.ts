/**
 * Deterministic write-time guard library for the (future) autonomous code-PR
 * adapter (#3670, Stage 1 — OFF). The full safety architecture for closing the
 * capability loop (research → auto-implementation → evaluation) was approved 7-0
 * with binding preconditions. This module is Stage 1: the PURE, DETERMINISTIC
 * guard primitives, behind NO runtime activation.
 *
 * SCOPE LOCK — this module performs NO code-generation, NO `git push`, NO
 * PR-open, NO flag wired to live behavior, and registers NO MCP tool / CLI
 * command / workflow. It is an internal library + tests ONLY. It is structurally
 * incapable of taking any autonomous action: it imports no git/network/exec
 * surface and only PROVIDES guard functions over realized facts the caller
 * passes in.
 *
 * Binding preconditions this module satisfies:
 *  - **A (deterministic-only decisions / self-guard segregation):** NO guard
 *    derives its decision from model output or untrusted text. Every guard
 *    operates ONLY on realized filesystem/diff facts supplied by the caller
 *    (resolved paths, changed-file line counts, the realized diff text, usage
 *    counters). There is no LLM call, no parsing of model rationale.
 *  - **B (self-modification lockout):** {@link classifyPath} denies the
 *    adapter's OWN guard code and the modules it depends on, so the autonomous
 *    path can never author a change to its own guards. The denylist is an
 *    explicit, exported, staleness-tested constant.
 *  - **C (audit for both PR and abort):** {@link auditAutonomousEvent} appends a
 *    structured record to the hash-chained audit log for BOTH a would-be PR and
 *    a fail-closed abort (no push — just the record).
 *  - **E (dependency-manifest authorship restriction):** {@link classifyPath}
 *    classifies `package.json`, `pnpm-lock.yaml`, and `tsconfig*.json` as
 *    `human-authorship-required`.
 *
 * Every guard returns a discriminated {@link GuardResult} — it NEVER throws for
 * an expected denial. Fail-closed = return a denial result (and, where a fact
 * cannot be resolved, DENY rather than allow).
 *
 * @module mcp/tools/codepr-guards
 */

// @export-no-consumer-yet — see #3670 (Stage 1 guard library; consumer lands in Stage 2/3)

import { realpathSync } from 'node:fs';
import { isAbsolute, resolve, relative, sep } from 'node:path';
import { z } from 'zod';
import { scanForSecrets, type SecretScanResult } from './diff-secret-scan.js';
import type { IAuditLogger, AuditActor } from '../../audit/audit-types.js';

// ============================================================================
// Result envelope
// ============================================================================

/**
 * The set of denial reasons a guard can return. Each guard returns at most the
 * subset relevant to it; {@link evaluateWriteGuards} can surface any of them.
 */
export type GuardDenialReason =
  | 'path_escape'
  | 'sensitive_path'
  | 'blast_radius_exceeded'
  | 'secret_detected'
  | 'budget_exceeded'
  | 'audit_append_failed';

/** A fail-closed denial result: an enumerated reason + a value-free detail. */
export interface GuardDenial {
  readonly ok: false;
  readonly reason: GuardDenialReason;
  readonly detail: string;
}

/**
 * Discriminated guard result. `ok: true` carries a guard-specific payload;
 * `ok: false` carries an enumerated {@link GuardDenialReason} plus a value-free
 * human detail. Guards NEVER throw for an expected denial — a denial is a value.
 */
export type GuardResult<TOk = Record<never, never>> = ({ readonly ok: true } & TOk) | GuardDenial;

/** Construct a denial result (the single fail-closed exit shape). */
function deny(reason: GuardDenialReason, detail: string): GuardDenial {
  return { ok: false, reason, detail };
}

// ============================================================================
// Guard 1 — Path confinement
// ============================================================================

/**
 * A seam for `realpathSync` so tests can drive symlink-escape paths through a
 * tmp dir without mocking `node:fs` globally. Defaults to the real
 * {@link realpathSync}. The seam takes and returns absolute paths.
 */
export type RealpathFn = (p: string) => string;

/**
 * Confine `candidatePath` to within `worktreeRoot`. Resolves both paths through
 * realpath semantics (so `..` traversal, an absolute path outside the root, and
 * a symlink whose TARGET escapes the root are all caught), then checks that the
 * resolved candidate is `worktreeRoot` itself or a descendant of it.
 *
 * Fail-closed: if either path cannot be realpath-resolved (e.g. the path does
 * not exist, or realpath throws), the guard DENIES with `path_escape` rather
 * than guessing. The caller is expected to pass paths for realized files.
 *
 * @param worktreeRoot - Absolute path to the worktree root the change is confined to.
 * @param candidatePath - The path (absolute or relative-to-root) being written.
 * @param realpath - Test seam; defaults to {@link realpathSync}.
 */
export function confinePath(
  worktreeRoot: string,
  candidatePath: string,
  realpath: RealpathFn = realpathSync
): GuardResult<{ readonly resolvedPath: string }> {
  if (!isAbsolute(worktreeRoot)) {
    return deny('path_escape', 'worktreeRoot must be an absolute path');
  }

  let resolvedRoot: string;
  try {
    resolvedRoot = realpath(worktreeRoot);
  } catch {
    return deny('path_escape', 'worktreeRoot could not be resolved (fail-closed)');
  }

  // Resolve the candidate against the root first (handles relative inputs and
  // `..`), then realpath the result so a symlink target that escapes is caught.
  const joined = isAbsolute(candidatePath) ? candidatePath : resolve(resolvedRoot, candidatePath);
  let resolvedCandidate: string;
  try {
    resolvedCandidate = realpath(joined);
  } catch {
    return deny('path_escape', 'candidate path could not be resolved (fail-closed)');
  }

  if (!isWithin(resolvedRoot, resolvedCandidate)) {
    return deny('path_escape', 'resolved path is outside the worktree root');
  }
  return { ok: true, resolvedPath: resolvedCandidate };
}

/**
 * True iff `child` is `parent` itself or a descendant of it, computed from the
 * realpath-resolved absolute paths (no further fs access). Uses `path.relative`
 * and rejects any result that starts with `..` or is itself absolute (a
 * different mount/drive), which is the standard escape-proof containment check.
 */
function isWithin(parent: string, child: string): boolean {
  if (child === parent) return true;
  const rel = relative(parent, child);
  if (rel === '') return true;
  if (rel === '..' || rel.startsWith('..' + sep)) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

// ============================================================================
// Guard 2 — Sensitive-path classifier
// ============================================================================

/** Why a path is sensitive (and therefore human-authorship-required). */
export type SensitiveCategory =
  | 'governance'
  | 'workflow'
  | 'codeowners'
  | 'authority'
  | 'audit'
  | 'self_guard'
  | 'dependency_manifest';

/** Classification of a single relative path. */
export type PathClassification =
  | { readonly sensitive: false }
  | { readonly sensitive: true; readonly category: SensitiveCategory };

/**
 * One sensitive-path rule: a predicate over a NORMALIZED, POSIX-separator,
 * leading-`./`-stripped relative path, plus the category it maps to. Kept as an
 * explicit, exported, reviewable array (precondition B requires the self-guard
 * denylist be reviewable + staleness-testable).
 */
export interface SensitivePathRule {
  readonly category: SensitiveCategory;
  readonly description: string;
  readonly match: (relPathPosix: string) => boolean;
}

/** Final path segment (basename) of a POSIX-normalized relative path. */
function basenamePosix(relPathPosix: string): string {
  const idx = relPathPosix.lastIndexOf('/');
  return idx === -1 ? relPathPosix : relPathPosix.slice(idx + 1);
}

/**
 * The self-modification lockout list (precondition B). These module basenames —
 * the guard code itself plus every reused/depended-on safety primitive — may
 * never be authored by the autonomous path. Exported so the lockout is
 * reviewable and the staleness test can assert it still names this very module.
 *
 * NOTE: each name is matched as a basename PREFIX (so `codepr-guards.ts`,
 * `codepr-guards.test.ts`, and any future `codepr-guards/*` all lock out), and
 * as a path segment (so a future directory of the same name locks out too).
 */
export const SELF_GUARD_MODULE_BASENAMES: readonly string[] = [
  'codepr-guards', // this guard module (+ its tests / future dir) — prefix match
  'diff-secret-scan', // reused: pre-push secret scan
  'repo-root-detection', // reused: repo-root / path confinement source
  'audit-logger', // reused: hash-chained audit log
  'audit-types', // reused: audit schemas/interfaces the guard imports
  'improvement-enforce-readiness', // the enable-readiness module (shadow→enforce gate)
  'remediation-readiness-collector', // companion readiness collector
] as const;

/** True iff the path's basename (or a segment) matches a self-guard module. */
function isSelfGuardPath(relPathPosix: string): boolean {
  const base = basenamePosix(relPathPosix);
  for (const name of SELF_GUARD_MODULE_BASENAMES) {
    if (base === name) return true;
    if (base.startsWith(name + '.')) return true; // foo.ts, foo.test.ts
    // future `codepr-guards/` dir: any path segment equal to the name
    if (relPathPosix === name || relPathPosix.startsWith(name + '/')) return true;
    if (relPathPosix.includes('/' + name + '/')) return true;
  }
  return false;
}

/**
 * The explicit, exported, reviewable sensitive-path ruleset. Order is not
 * load-bearing for the verdict (any match → sensitive) but earlier matches win
 * the reported `category`. Self-guard and dependency-manifest rules implement
 * preconditions B and E respectively.
 */
export const SENSITIVE_PATH_RULES: readonly SensitivePathRule[] = [
  {
    category: 'self_guard',
    description: 'the adapter’s own guard code + reused safety primitives (precondition B)',
    match: isSelfGuardPath,
  },
  {
    category: 'governance',
    description: 'governance/** — voting, ratification, tier ledgers',
    match: (p) => p === 'governance' || p.startsWith('governance/') || p.includes('/governance/'),
  },
  {
    category: 'workflow',
    description: '.github/workflows/** — CI/CD definitions',
    match: (p) => p.startsWith('.github/workflows/') || p.includes('/.github/workflows/'),
  },
  {
    category: 'codeowners',
    description: 'any CODEOWNERS file',
    match: (p) => basenamePosix(p) === 'CODEOWNERS',
  },
  {
    category: 'audit',
    description: 'audit subsystem: src/audit/** (tamper-evidence — human-authored only)',
    match: (p) => p === 'src/audit' || p.startsWith('src/audit/') || p.includes('/src/audit/'),
  },
  {
    category: 'authority',
    description: 'auth/authority code: **/authority-*, **/auth/**',
    match: (p) =>
      basenamePosix(p).startsWith('authority-') || p.includes('/auth/') || p.startsWith('auth/'),
  },
  {
    category: 'dependency_manifest',
    description:
      'dependency manifests: package.json, pnpm-lock.yaml, tsconfig*.json (precondition E)',
    match: (p) => {
      const base = basenamePosix(p);
      if (base === 'package.json') return true;
      if (base === 'pnpm-lock.yaml') return true;
      if (base.startsWith('tsconfig') && base.endsWith('.json')) return true;
      return false;
    },
  },
];

/**
 * Normalize a relative path to POSIX separators and strip a leading `./` so the
 * rules can be written against a single canonical form. Does NOT resolve the
 * filesystem (this is a pure classifier over the supplied string).
 */
function normalizeRelPath(relPath: string): string {
  let p = relPath.replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  return p;
}

/**
 * Classify a relative path as sensitive (human-authorship-required) or not.
 * Pure over the supplied string — no filesystem access, no model input. Returns
 * the FIRST matching rule's category (rule order in {@link SENSITIVE_PATH_RULES}).
 */
export function classifyPath(relPath: string): PathClassification {
  const p = normalizeRelPath(relPath);
  for (const rule of SENSITIVE_PATH_RULES) {
    if (rule.match(p)) return { sensitive: true, category: rule.category };
  }
  return { sensitive: false };
}

// ============================================================================
// Guard 3 — Blast-radius cap
// ============================================================================

/** A single realized changed file (counts, not content). */
export interface ChangedFile {
  readonly path: string;
  readonly addedLines: number;
  readonly removedLines: number;
}

/** Zod schema for {@link BlastRadiusLimits} — validated, with documented defaults. */
export const BlastRadiusLimitsSchema = z
  .object({
    /** Max number of files the change may touch. Default 20. */
    maxFiles: z.number().int().positive().default(20),
    /** Max total changed lines (added + removed across all files). Default 400. */
    maxLines: z.number().int().positive().default(400),
  })
  .strict();
export type BlastRadiusLimits = z.infer<typeof BlastRadiusLimitsSchema>;

/** Documented default blast-radius limits (small, conservative for a first stage). */
export const DEFAULT_BLAST_RADIUS_LIMITS: Readonly<BlastRadiusLimits> = Object.freeze(
  BlastRadiusLimitsSchema.parse({})
);

/**
 * Deny when the change set is too large OR touches a sensitive path. Pure over
 * the supplied counts + paths (precondition A — no content, no model input).
 *
 *  - `sensitive_path` when ANY changed file is sensitive per {@link classifyPath}
 *    (checked first — a sensitive touch is denied regardless of size).
 *  - `blast_radius_exceeded` when files touched > maxFiles or total changed
 *    lines (added + removed) > maxLines.
 *
 * @param changedFiles - The realized change set (paths + per-file line counts).
 * @param limits - Validated limits; defaults to {@link DEFAULT_BLAST_RADIUS_LIMITS}.
 */
export function checkBlastRadius(
  changedFiles: readonly ChangedFile[],
  limits: BlastRadiusLimits = DEFAULT_BLAST_RADIUS_LIMITS
): GuardResult<{ readonly filesTouched: number; readonly linesTouched: number }> {
  const parsed = BlastRadiusLimitsSchema.safeParse(limits);
  if (!parsed.success) {
    return deny('blast_radius_exceeded', 'invalid blast-radius limits (fail-closed)');
  }
  const { maxFiles, maxLines } = parsed.data;

  // Sensitive-path check first: a sensitive file is denied even within size caps.
  for (const f of changedFiles) {
    const cls = classifyPath(f.path);
    if (cls.sensitive) {
      return deny('sensitive_path', `changed file is sensitive (${cls.category}): ${f.path}`);
    }
  }

  const filesTouched = changedFiles.length;
  if (filesTouched > maxFiles) {
    return deny(
      'blast_radius_exceeded',
      `files touched ${String(filesTouched)} exceeds maxFiles ${String(maxFiles)}`
    );
  }

  let linesTouched = 0;
  for (const f of changedFiles) linesTouched += f.addedLines + f.removedLines;
  if (linesTouched > maxLines) {
    return deny(
      'blast_radius_exceeded',
      `changed lines ${String(linesTouched)} exceeds maxLines ${String(maxLines)}`
    );
  }

  return { ok: true, filesTouched, linesTouched };
}

// ============================================================================
// Guard 4 — Pre-push secret-scan
// ============================================================================

/**
 * Scan a realized diff for secrets and DENY on any finding. Wraps the in-tree
 * {@link scanForSecrets} (#3669). This is the deterministic, scan-THEN-push
 * gate: the caller, in a later stage, must NEVER push before this returns `ok`.
 * Findings are value-free (pattern name + line only) — never the secret value.
 *
 * Fail-closed: any single finding flips the result to a `secret_detected` denial.
 *
 * @param diff - The realized unified diff text (a fact, not model output).
 */
export function scanDiffOrDeny(diff: string): GuardResult<{ readonly scan: SecretScanResult }> {
  const scan = scanForSecrets(diff);
  if (!scan.clean) {
    const summary = scan.findings.map((f) => `${f.pattern}@L${String(f.line)}`).join(', ');
    return deny(
      'secret_detected',
      `secret scan found ${String(scan.findings.length)} finding(s): ${summary}`
    );
  }
  return { ok: true, scan };
}

// ============================================================================
// Guard 5 — Audit-append (for both a would-be PR and a fail-closed abort)
// ============================================================================

/** The decision an autonomous run reached at the audit point. */
export type AutonomousDecision = 'would_open_pr' | 'abort';

/** Structured record for {@link auditAutonomousEvent}. All fields are facts/hashes. */
export interface AutonomousEventRecord {
  /** Correlates all events for one autonomous run. */
  readonly runId: string;
  /** Hash of the source signal (e.g. improvement/fitness signal) that triggered the run. */
  readonly sourceSignalHash: string;
  /** Hash of the realized diff (so the audited content is pinned without storing it). */
  readonly diffHash: string;
  /** The deterministic secret-scan verdict at the gate. */
  readonly scanVerdict: 'clean' | 'secret_detected';
  /** Number of files the change touched. */
  readonly filesTouched: number;
  /** Total changed lines (added + removed). */
  readonly linesTouched: number;
  /**
   * Placeholder for the identity of the token/credential the (future) push would
   * use. Stage 1 has no token; carried so the audit shape is stable for later
   * stages. Use a non-secret label (e.g. a key id or `'none'`), NEVER a secret.
   */
  readonly tokenIdentity: string;
  /** `would_open_pr` for a passing run, `abort` for a fail-closed stop. */
  readonly decision: AutonomousDecision;
  /** For an abort, the enumerated guard reason; omitted/undefined for a pass. */
  readonly abortReason?: GuardDenialReason | undefined;
  /** Optional actor; defaults to a system autonomous-code-PR actor. */
  readonly actor?: AuditActor | undefined;
}

/** Default actor for an autonomous code-PR audit event. */
const AUTONOMOUS_ACTOR: AuditActor = {
  type: 'system',
  id: 'autonomous-code-pr',
  name: 'Autonomous Code-PR Adapter (Stage 1, OFF)',
};

/**
 * Append a structured autonomous-event record to the hash-chained audit log
 * (precondition C). Callable for BOTH a would-be PR (`decision:'would_open_pr'`)
 * and a fail-closed abort (`decision:'abort'`, with the `abortReason`). This
 * performs NO push — it only writes the audit record via the injected
 * {@link IAuditLogger}.
 *
 * The {@link IAuditLogger.log} call is synchronous (it enqueues); a thrown error
 * from the logger is caught and converted to an `audit_append_failed` denial so
 * an audit failure is itself fail-closed (the caller must treat a failed audit
 * as a reason NOT to proceed).
 *
 * @param logger - The hash-chained audit logger (dependency-injected).
 * @param record - The structured, fact-only event record.
 */
export function auditAutonomousEvent(
  logger: IAuditLogger,
  record: AutonomousEventRecord
): GuardResult {
  try {
    logger.log({
      category: 'security',
      severity: record.decision === 'abort' ? 'warning' : 'info',
      outcome: record.decision === 'abort' ? 'denied' : 'success',
      action: `autonomous_code_pr.${record.decision}`,
      description:
        record.decision === 'abort'
          ? `autonomous code-PR aborted (${record.abortReason ?? 'unspecified'})`
          : 'autonomous code-PR write-guards passed (would open PR)',
      actor: record.actor ?? AUTONOMOUS_ACTOR,
      resource: { type: 'autonomous-run', id: record.runId, name: record.runId },
      metadata: {
        runId: record.runId,
        sourceSignalHash: record.sourceSignalHash,
        diffHash: record.diffHash,
        scanVerdict: record.scanVerdict,
        filesTouched: record.filesTouched,
        linesTouched: record.linesTouched,
        tokenIdentity: record.tokenIdentity,
        decision: record.decision,
        abortReason: record.abortReason ?? null,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return deny('audit_append_failed', `audit append threw (fail-closed): ${detail}`);
  }
  return { ok: true };
}

// ============================================================================
// Guard 6 — Resource-limit (budget) guard
// ============================================================================

/** A realized usage snapshot for one autonomous run. */
export interface ResourceUsage {
  /** Wall-clock elapsed for the run so far, in milliseconds. */
  readonly wallClockMs: number;
  /** Tokens consumed so far. */
  readonly tokens: number;
  /** Tool calls made so far. */
  readonly toolCalls: number;
}

/** Zod schema for {@link ResourceBudgetLimits} — validated, with documented defaults. */
export const ResourceBudgetLimitsSchema = z
  .object({
    /** Wall-clock ceiling in ms. Default 600000 (10 min). */
    maxWallClockMs: z.number().int().positive().default(600_000),
    /** Token ceiling. Default 200000. */
    maxTokens: z.number().int().positive().default(200_000),
    /** Tool-call ceiling. Default 200. */
    maxToolCalls: z.number().int().positive().default(200),
  })
  .strict();
export type ResourceBudgetLimits = z.infer<typeof ResourceBudgetLimitsSchema>;

/** Documented default resource budget. */
export const DEFAULT_RESOURCE_BUDGET_LIMITS: Readonly<ResourceBudgetLimits> = Object.freeze(
  ResourceBudgetLimitsSchema.parse({})
);

/**
 * Deny when any resource ceiling is breached (`budget_exceeded`). Pure function
 * over a usage snapshot (precondition A). Denial is strictly `usage > limit`, so
 * hitting the ceiling exactly is still permitted (the ceiling is the last
 * allowed value).
 *
 * @param usage - The realized usage snapshot.
 * @param limits - Validated ceilings; defaults to {@link DEFAULT_RESOURCE_BUDGET_LIMITS}.
 */
export function checkResourceBudget(
  usage: ResourceUsage,
  limits: ResourceBudgetLimits = DEFAULT_RESOURCE_BUDGET_LIMITS
): GuardResult {
  const parsed = ResourceBudgetLimitsSchema.safeParse(limits);
  if (!parsed.success) {
    return deny('budget_exceeded', 'invalid resource limits (fail-closed)');
  }
  const { maxWallClockMs, maxTokens, maxToolCalls } = parsed.data;

  if (usage.wallClockMs > maxWallClockMs) {
    return deny(
      'budget_exceeded',
      `wall-clock ${String(usage.wallClockMs)}ms exceeds ${String(maxWallClockMs)}ms`
    );
  }
  if (usage.tokens > maxTokens) {
    return deny('budget_exceeded', `tokens ${String(usage.tokens)} exceeds ${String(maxTokens)}`);
  }
  if (usage.toolCalls > maxToolCalls) {
    return deny(
      'budget_exceeded',
      `tool calls ${String(usage.toolCalls)} exceeds ${String(maxToolCalls)}`
    );
  }
  return { ok: true };
}

// ============================================================================
// Composite — evaluateWriteGuards (single deterministic entry point)
// ============================================================================

/** Input to {@link evaluateWriteGuards}: a fully-realized change set. */
export interface WriteGuardsInput {
  /** Absolute worktree root the change must be confined to. */
  readonly worktreeRoot: string;
  /** The realized change set (paths + per-file line counts). */
  readonly changedFiles: readonly ChangedFile[];
  /** The realized unified diff text (for the secret scan). */
  readonly diff: string;
  /** The realized resource-usage snapshot. */
  readonly usage: ResourceUsage;
  /** Optional blast-radius limits override. */
  readonly blastRadiusLimits?: BlastRadiusLimits | undefined;
  /** Optional resource-budget limits override. */
  readonly resourceLimits?: ResourceBudgetLimits | undefined;
  /** Test seam for path realpath resolution. */
  readonly realpath?: RealpathFn | undefined;
}

/**
 * Compose guards 1–4 + 6 over a realized change set and return the FIRST denial
 * (or `ok`). Single deterministic entry point for the future adapter; it
 * SHORT-CIRCUITS fail-closed — the first guard to deny stops evaluation and its
 * denial is returned unchanged.
 *
 * Order (hardest-stop first):
 *  1. path confinement on every changed file (an escape is the hardest stop),
 *  2. blast-radius (size + sensitive-path),
 *  3. secret scan over the diff,
 *  4. resource budget.
 *
 * The audit-append guard (5) is intentionally NOT composed here — auditing is
 * the caller's responsibility on BOTH the pass and abort paths (precondition C),
 * using the verdict this function returns.
 */
export function evaluateWriteGuards(input: WriteGuardsInput): GuardResult {
  // 1. Path confinement — every changed file must resolve within the root.
  for (const f of input.changedFiles) {
    const confined = confinePath(input.worktreeRoot, f.path, input.realpath);
    if (!confined.ok) return confined;
  }

  // 2. Blast radius (also denies any sensitive path).
  const blast = checkBlastRadius(input.changedFiles, input.blastRadiusLimits);
  if (!blast.ok) return blast;

  // 3. Secret scan.
  const secrets = scanDiffOrDeny(input.diff);
  if (!secrets.ok) return secrets;

  // 4. Resource budget.
  const budget = checkResourceBudget(input.usage, input.resourceLimits);
  if (!budget.ok) return budget;

  return { ok: true };
}
