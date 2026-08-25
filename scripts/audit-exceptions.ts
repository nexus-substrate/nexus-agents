/**
 * Attribution and expiry ledger for Security Audit exceptions (#4794).
 *
 * `pnpm.auditConfig.ignoreGhsas` / `ignoreCves` is what actually mutes an
 * advisory, but it is a flat list of ids with nowhere to record WHO suppressed
 * a finding, WHY, or UNTIL WHEN. An escape path is only as strong as its
 * attribution (#4690), and the panel that approved requiring this gate warned
 * specifically that an allowlist decays into "a rubber-stamp graveyard of
 * ignored exceptions".
 *
 * So the two are kept in lockstep: pnpm's list is the mechanism, this ledger is
 * the warrant, and `validateExceptions` fails if they disagree or if a warrant
 * has expired.
 *
 * @module scripts/audit-exceptions
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One reviewed suppression, with the warrant that justifies it. */
export interface AuditException {
  /** GHSA or CVE identifier — must match an entry in `pnpm.auditConfig`. */
  readonly id: string;
  /** Why this advisory does not block us: no reachable path, upstream fix pending, etc. */
  readonly reason: string;
  /** GitHub handle accountable for retiring it. */
  readonly owner: string;
  /** Tracking issue number. Deferring is fine; untracked is not. */
  readonly issue: number;
  /** ISO date (YYYY-MM-DD) after which the exception fails CI. */
  readonly expires: string;
}

const ID_PATTERN = /^(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}|CVE-\d{4}-\d{4,})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the ids pnpm is actually configured to mute. */
export function configuredIds(packageJson: Record<string, unknown>): string[] {
  const pnpm = packageJson['pnpm'] as Record<string, unknown> | undefined;
  const audit = pnpm?.['auditConfig'] as Record<string, unknown> | undefined;
  const ghsas = Array.isArray(audit?.['ignoreGhsas']) ? (audit['ignoreGhsas'] as string[]) : [];
  const cves = Array.isArray(audit?.['ignoreCves']) ? (audit['ignoreCves'] as string[]) : [];
  return [...ghsas, ...cves];
}

/**
 * Everything the warrant itself must carry, independent of the mute-list.
 *
 * `today` is injected rather than read from the clock so the expiry rule is
 * testable in both directions.
 */
function warrantProblems(e: AuditException, today: string): string[] {
  const problems: string[] = [];
  const where = `exception ${e.id}`;
  if (!ID_PATTERN.test(e.id)) problems.push(`${where}: not a GHSA or CVE identifier`);
  if (e.reason.trim() === '') problems.push(`${where}: needs a reason`);
  if (e.owner.trim() === '') problems.push(`${where}: needs an owner accountable for retiring it`);
  if (!Number.isInteger(e.issue) || e.issue <= 0) problems.push(`${where}: needs a tracking issue`);
  if (!DATE_PATTERN.test(e.expires)) {
    problems.push(`${where}: expires must be YYYY-MM-DD`);
  } else if (e.expires < today) {
    problems.push(
      `${where}: expired ${e.expires} — re-review it (owner @${e.owner}, issue #${String(e.issue)}), then extend or remove`
    );
  }
  return problems;
}

/**
 * Every way the ledger and the mute-list can disagree.
 *
 * Returns messages rather than throwing so a caller can report all of them at
 * once — fixing these one CI run at a time is how a reviewer gives up and
 * reaches for the bypass instead.
 */
export function validateExceptions(
  exceptions: readonly AuditException[],
  configured: readonly string[],
  today: string
): string[] {
  const problems: string[] = [];
  const ledgerIds = new Set(exceptions.map((e) => e.id));

  for (const e of exceptions) {
    problems.push(...warrantProblems(e, today));
    if (!configured.includes(e.id)) {
      problems.push(
        `exception ${e.id}: in the ledger but NOT muted in pnpm.auditConfig — it suppresses nothing`
      );
    }
  }

  // The direction that actually matters: a mute with no warrant is an
  // unattributed suppression, which is the shape this ledger exists to prevent.
  for (const id of configured) {
    if (!ledgerIds.has(id)) {
      problems.push(
        `${id}: muted in pnpm.auditConfig with no ledger entry — who suppressed this, and until when?`
      );
    }
  }
  return problems;
}

/** Loads the ledger. Absent `exceptions` is an error, not an empty list. */
export function loadLedger(repoRoot: string): AuditException[] {
  const raw = readFileSync(join(repoRoot, '.github', 'audit-exceptions.json'), 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const list = parsed['exceptions'];
  if (!Array.isArray(list)) throw new Error('audit-exceptions.json: "exceptions" must be an array');
  return list as AuditException[];
}
