/**
 * nexus-agents/audit - Source-checkout write guard (#4415, shared since #6070).
 *
 * Both committable, hash-chained JSONL ledgers (`governance/pr-review-records.jsonl`,
 * `governance/vote-records.jsonl`) are tracked in the source checkout and read
 * by a gate that treats their contents as evidence: the governor-review gate
 * (#3831) and the authority-tier promotion gate (#3895) respectively. A test
 * that appends to one of them manufactures a record that self-hashes cleanly
 * and is indistinguishable from a real verdict — which is exactly how #4415
 * happened, and it was noticed only because `git status` showed a tracked file
 * dirty.
 *
 * The pr-review store carried this guard privately from #4415; the vote store
 * had none, and its `NEXUS_VOTE_RECORDS_PATH` override honours an absolute path
 * as-is by design, so the tracked ledger was reachable from any test that set
 * the env var (#6070). One definition, parameterised on the tracked path and
 * the per-ledger env var, keeps the two stores from drifting apart again.
 *
 * Callers MUST invoke {@link assertNotSourceCheckoutWrite} BEFORE their `try`:
 * a swallowed guard would silently skip the write and hide the very mistake it
 * exists to surface.
 *
 * @module audit/source-checkout-guard
 */

import { join, resolve } from 'node:path';

import { findRepoRoot } from '../config/repo-root-detection.js';

/** True when running under a test runner (vitest sets `VITEST`). */
export function isUnderTestRunner(): boolean {
  return process.env['VITEST'] !== undefined || process.env['NODE_ENV'] === 'test';
}

/**
 * Refuse to WRITE the source checkout's own tracked chain from a test (#4415).
 *
 * `governance/pr-review-records.jsonl` is tracked and hash-chained. During
 * #4412 a test appended three fabricated verdicts to it — they chained
 * correctly onto each other, so `verify_audit_chain` would have read a valid
 * chain containing fake reviews. They were noticed only because `git status`
 * showed a tracked file dirty before a commit.
 *
 * A fabricated record that hash-chains cleanly is worse than a corrupt file:
 * it is indistinguishable from a real one. The threat model already scopes the
 * chain as tamper-*evident*, which only holds if we do not manufacture
 * plausible entries ourselves.
 *
 * Guards the DESTINATION, not how it was derived — an explicit `filePath` or
 * env var pointing at the same file is the same harm. Resolution itself stays
 * unguarded: the stores' path resolvers are queries, and tests legitimately
 * assert their fall-through behaviour (#4278/#4312) without writing anything.
 *
 * The comparison is EQUALITY of resolved paths, not a prefix test: a sibling
 * such as `<tracked>.bak` is a different file and a legitimate fixture target.
 *
 * A throwaway repo — the shape a legitimate persistence test uses — is
 * untouched. Outside a test runner the guard is inert.
 *
 * @param filePath - the destination the caller is about to append to.
 * @param trackedRelPath - the ledger's path relative to the repo root, e.g.
 *   `governance/vote-records.jsonl`.
 * @param overrideEnvVar - the per-ledger env var named in the refusal so the
 *   reader knows which escape hatch to use. The remedy says where to POINT it
 *   (a throwaway path), not merely to set it: for the vote store the env var
 *   is usually the very thing that reached the tracked file, and neither
 *   store's persist function takes a `repoPath` option (#6081).
 */
export function assertNotSourceCheckoutWrite(
  filePath: string,
  trackedRelPath: string,
  overrideEnvVar: string
): void {
  if (!isUnderTestRunner()) return;
  const here = findRepoRoot(process.cwd());
  if (here === null) return;
  if (resolve(filePath) !== resolve(join(here, trackedRelPath))) return;
  throw new Error(
    `Refusing to write ${filePath} from a test run (#4415): this is the source ` +
      "checkout's tracked, hash-chained audit file, and a fabricated record that " +
      'chains cleanly is indistinguishable from a real verdict. ' +
      `Point ${overrideEnvVar} (or the explicit filePath) at a throwaway path such ` +
      'as a temp directory.'
  );
}
