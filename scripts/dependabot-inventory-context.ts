/** Evidence provenance validation for the Dependabot inventory checker. */

import { validateDependabotQuery } from './dependabot-inventory-query.js';

export const DEPENDABOT_ALERT_STATES = ['OPEN', 'FIXED', 'DISMISSED', 'AUTO_DISMISSED'] as const;

export type DependabotAlertState = (typeof DEPENDABOT_ALERT_STATES)[number];
export type DependabotInventoryStatus = 'clean' | 'open_count' | 'inconsistent' | 'unmeasured';
export type DependabotInventoryScope = 'accessible_connection' | 'filtered_connection' | 'unknown';

export interface DependabotEvidenceContext {
  readonly repository?: unknown;
  readonly headSha?: unknown;
  readonly capturedAt?: unknown;
  readonly query?: unknown;
  readonly queryOwner?: unknown;
  readonly queryName?: unknown;
  readonly requestedState?: unknown;
}

export interface DependabotInventoryAssessment {
  readonly status: DependabotInventoryStatus;
  readonly scope: DependabotInventoryScope;
  readonly source: 'github_graphql';
  readonly repository: string | null;
  readonly headSha: string | null;
  readonly capturedAt: string | null;
  readonly queryValidated: boolean;
  readonly queryOwner: string | null;
  readonly queryName: string | null;
  readonly requestedState: DependabotAlertState | null;
  readonly pageCount: number;
  readonly reportedTotal: number | null;
  readonly returnedAlerts: number | null;
  readonly uniqueAlerts: number | null;
  readonly openCount: number | null;
  readonly stateCounts: Readonly<Record<DependabotAlertState, number>> | null;
  readonly findings: readonly string[];
}

export interface ParsedContext {
  readonly repository: string | null;
  readonly headSha: string | null;
  readonly capturedAt: string | null;
  readonly queryValidated: boolean;
  readonly queryOwner: string | null;
  readonly queryName: string | null;
  readonly requestedState: DependabotAlertState | null;
  readonly scope: DependabotInventoryScope;
  readonly findings: readonly string[];
}

function isDependabotAlertState(value: string): value is DependabotAlertState {
  return DEPENDABOT_ALERT_STATES.includes(value as DependabotAlertState);
}

function parseRepository(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value)
    ? value
    : null;
}

function parseHeadSha(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null;
}

function parseCapturedAt(value: unknown): string | null {
  return typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

export function parseContext(context: DependabotEvidenceContext): ParsedContext {
  const repository = parseRepository(context.repository);
  const headSha = parseHeadSha(context.headSha);
  const capturedAt = parseCapturedAt(context.capturedAt);
  const query = validateDependabotQuery(context.query);
  const queryOwner = parseRepositoryPart(context.queryOwner);
  const queryName = parseRepositoryPart(context.queryName);
  const requestedState =
    typeof context.requestedState === 'string' && isDependabotAlertState(context.requestedState)
      ? context.requestedState
      : null;
  const findings = contextFindings(context, {
    repository,
    headSha,
    capturedAt,
    requestedState,
    query,
    queryOwner,
    queryName,
  });
  return {
    repository,
    headSha,
    capturedAt,
    requestedState,
    scope:
      context.requestedState === undefined && !query.filtered
        ? 'accessible_connection'
        : 'filtered_connection',
    queryValidated: query.valid,
    queryOwner,
    queryName,
    findings,
  };
}

function parseRepositoryPart(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value) ? value : null;
}

function contextFindings(
  context: DependabotEvidenceContext,
  parsed: {
    readonly repository: string | null;
    readonly headSha: string | null;
    readonly capturedAt: string | null;
    readonly requestedState: DependabotAlertState | null;
    readonly query: ReturnType<typeof validateDependabotQuery>;
    readonly queryOwner: string | null;
    readonly queryName: string | null;
  }
): string[] {
  return [
    ...basicContextFindings(parsed),
    ...queryContextFindings(parsed),
    ...(context.requestedState !== undefined && parsed.requestedState === null
      ? ['unknown_requested_state']
      : []),
  ];
}

function basicContextFindings(parsed: Parameters<typeof contextFindings>[1]): string[] {
  return [
    ...(parsed.repository === null ? ['missing_or_invalid_repository'] : []),
    ...(parsed.headSha === null ? ['missing_or_invalid_head_sha'] : []),
    ...(parsed.capturedAt === null ? ['missing_or_invalid_capture_time'] : []),
  ];
}

function queryContextFindings(parsed: Parameters<typeof contextFindings>[1]): string[] {
  return [
    ...(parsed.queryOwner === null ? ['missing_or_invalid_query_owner'] : []),
    ...(parsed.queryName === null ? ['missing_or_invalid_query_name'] : []),
    ...(parsed.repository !== null &&
    parsed.queryOwner !== null &&
    parsed.queryName !== null &&
    parsed.repository !== `${parsed.queryOwner}/${parsed.queryName}`
      ? ['query_repository_mismatch']
      : []),
    ...(!parsed.query.valid && !parsed.query.filtered ? ['missing_or_invalid_query'] : []),
    ...(parsed.query.filtered ? ['filtered_query_scope'] : []),
  ];
}
