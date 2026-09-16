/**
 * The append-only half of the ledger gate (#6213, #6348): the base ledger's
 * record lines must be an ordered subsequence of the head's, byte-for-byte —
 * with exactly one admitted difference, a redaction's rewrite of the line it
 * names. Split out of `governor-ledger-evidence.ts` (#6372) so that file
 * stays under the line budget; governor-owned like its parent.
 *
 * @module scripts/governor-ledger-append-only
 */
import { isRecord } from '../packages/nexus-agents/src/utils/type-coercion.js';
import { redactedRolesByTarget } from '../packages/nexus-agents/src/audit/redaction-record.js';
import { parseVoteRecordsText } from '../packages/nexus-agents/src/audit/vote-record-store.js';

/** The verdict `appendOnlyVerdict` returns when a base line cannot be matched. */
export interface LedgerRewritten {
  readonly kind: 'ledger-rewritten';
  readonly baseLineCount: number;
  readonly headLineCount: number;
  /** 1-based index of the first base line that could not be matched in order. */
  readonly divergesAt: number;
}

/** The ledger's record lines: every non-blank line, bytes untouched. */
function recordLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim() !== '');
}

/** Stable key order at every object depth; array order and all raw values are retained. */
function stableJson(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (!isRecord(entry)) return entry;
    const keys = Object.keys(entry).sort();
    return Object.fromEntries(keys.map((key) => [key, entry[key]] as const));
  });
}

/** Byte-exact unless a newly appended redaction authorizes just the named openings. */
function matchesLedgerLine(
  baseLine: string,
  headLine: string,
  rolesByTarget: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  if (baseLine === headLine) return true;
  try {
    const base: unknown = JSON.parse(baseLine);
    const head: unknown = JSON.parse(headLine);
    if (!isRecord(base) || typeof base['id'] !== 'string') return false;
    const roles = rolesByTarget.get(base['id']);
    // No newly named roles (including an empty redaction set) means no rewrite exception.
    if (roles === undefined || roles.size === 0 || !Array.isArray(base['voters'])) return false;
    const voters = base['voters'].map((voter: unknown) => {
      if (!isRecord(voter) || typeof voter['role'] !== 'string' || !roles.has(voter['role']))
        return voter;
      const { reasoning: _reasoning, reasoningNonce: _reasoningNonce, ...rest } = voter;
      return rest;
    });
    return stableJson({ ...base, voters }) === stableJson(head);
  } catch {
    return false; // Neither malformed side can receive the redaction exception.
  }
}

/**
 * Append-only against the base (#6213): the base's record lines must be an
 * ordered subsequence of the head's — a single forward scan, each base line
 * matched byte-for-byte, or canonically after removing only the openings a
 * newly appended redaction names (#6348), to an unconsumed head line. Returns the
 * verdict on the first base line that cannot be matched in order (missing,
 * changed, or moved before an earlier base line); `undefined` when every
 * base line is found (an empty base is a subsequence of everything).
 */
export function appendOnlyVerdict(headText: string, baseText: string): LedgerRewritten | undefined {
  const base = recordLines(baseText);
  const head = recordLines(headText);
  if (base.length === 0) return undefined; // No historical lines to preserve.
  const baseIds = new Set(parseVoteRecordsText(baseText).redactions.map((r) => r.id));
  const appended = parseVoteRecordsText(headText).redactions.filter((r) => !baseIds.has(r.id));
  const rolesByTarget = redactedRolesByTarget(appended);
  const counts = { baseLineCount: base.length, headLineCount: head.length };
  let cursor = 0;
  for (const [i, baseLine] of base.entries()) {
    let at = cursor;
    while (at < head.length && !matchesLedgerLine(baseLine, head[at] ?? '', rolesByTarget)) at++;
    if (at === head.length) {
      return { kind: 'ledger-rewritten', ...counts, divergesAt: i + 1 };
    }
    cursor = at + 1;
  }
  return undefined;
}
