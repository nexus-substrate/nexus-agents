/** Query-contract checks for the Dependabot inventory evidence capture. */

export interface DependabotQueryAssessment {
  readonly query: string | null;
  readonly filtered: boolean;
  readonly valid: boolean;
}

const CANONICAL_QUERY =
  'query($owner: String!, $name: String!, $endCursor: String) { repository(owner: $owner, name: $name) { vulnerabilityAlerts(first: 100, after: $endCursor) { totalCount pageInfo { hasNextPage startCursor endCursor } edges { cursor node { id state } } } } }';

/** Validate the exact unfiltered connection shape consumed by the inventory checker. */
export function validateDependabotQuery(value: unknown): DependabotQueryAssessment {
  if (typeof value !== 'string' || value.length > 4_096) {
    return { query: null, filtered: false, valid: false };
  }
  const argumentList = value.match(/vulnerabilityAlerts\s*\(([^)]*)\)/)?.[1];
  if (argumentList === undefined) return { query: null, filtered: false, valid: false };
  if (/\bstates\s*:/.test(argumentList)) return { query: value, filtered: true, valid: false };
  const canonicalQuery = CANONICAL_QUERY.replace(/\s+/g, '');
  return { query: value, filtered: false, valid: value.replace(/\s+/g, '') === canonicalQuery };
}
