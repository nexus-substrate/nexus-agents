/** Parse the private discovery ledger without guessing whether a finding was closed. */
import { z } from 'zod';

/** Historical findings require only string severity; every other field passes through. */
export const FindingSchema = z.looseObject({ severity: z.string() });

/** A separate closure event, appended without changing its target finding. */
export const ResolutionSchema = z.object({
  kind: z.literal('resolution'),
  target: z.string().min(1),
  status: z.enum(['fixed', 'accepted', 'duplicate', 'refuted']),
  fixedIn: z.string().optional(),
  at: z.iso.datetime({ offset: true }),
  by: z.string().min(1),
  note: z.string().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;

const LegacyResolutionSchema = z.looseObject({ resolves: z.string() }).transform((record) => ({
  kind: 'resolution' as const,
  target: record.resolves,
  status: 'fixed' as const,
  fixedIn: record['commit'],
  at: record['timestamp'],
  by: record['foundDuring'] ?? 'unknown',
}));
type RecordedResolution = Resolution | z.infer<typeof LegacyResolutionSchema>;

export interface LedgerRecords {
  findings: Finding[];
  resolutions: RecordedResolution[];
  /** Unrecognized objects retain their key set, never their values. */
  shapeUnmeasured: { line: number; keys: string[] }[];
  /** One-based physical line numbers; never retains invalid record contents. */
  invalidLines: number[];
}

export interface FindingStatuses {
  open: Finding[];
  resolved: Finding[];
  statusUnmeasured: Finding[];
}

/** Classify JSON objects without treating an unfamiliar shape as invalid JSON. */
function classifyRecord(value: unknown, line: number, records: LedgerRecords): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    records.invalidLines.push(line);
    return;
  }
  const finding = FindingSchema.safeParse(value);
  if (finding.success) {
    records.findings.push(finding.data);
    return;
  }
  const resolution = ResolutionSchema.safeParse(value);
  const legacy = LegacyResolutionSchema.safeParse(value);
  if (resolution.success) records.resolutions.push(resolution.data);
  else if (legacy.success) records.resolutions.push(legacy.data);
  else records.shapeUnmeasured.push({ line, keys: Object.keys(value).sort() });
}

/** Every physical record is classified; a final newline only terminates the last record. */
export function readLedger(text: string): LedgerRecords {
  const records: LedgerRecords = {
    findings: [],
    resolutions: [],
    shapeUnmeasured: [],
    invalidLines: [],
  };
  // An empty file has no records; blank physical records are invalid JSON.
  if (text === '') return records;
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const [index, line] of lines.entries()) {
    try {
      const value: unknown = JSON.parse(line);
      classifyRecord(value, index + 1, records);
    } catch {
      records.invalidLines.push(index + 1);
    }
  }
  return records;
}

/** The first present identity field is authoritative; missing/non-string identities cannot be targeted. */
export function findingIdentity(finding: Finding): string | undefined {
  const identity =
    finding['id'] ??
    finding['timestamp'] ??
    finding['discoveredAt'] ??
    finding['recordedAt'] ??
    finding['ts'];
  return typeof identity === 'string' ? identity : undefined;
}

const CLOSED_STATUSES = new Set([
  'fixed',
  'resolved',
  'accepted',
  'duplicate',
  'refuted',
  'wontfix',
]);
const OPEN_STATUSES = new Set(['open', 'fixing', 'latent', 'issue-filed']);

function hasInlineResolution(finding: Finding): boolean {
  const status = finding['status'];
  return (
    (typeof status === 'string' && CLOSED_STATUSES.has(status)) ||
    Object.hasOwn(finding, 'resolvedAt') ||
    typeof finding['resolution'] === 'string'
  );
}

/** Closure events, canonical closed statuses and explicit inline closure evidence resolve findings. */
export function openFindings(
  findings: readonly Finding[],
  resolutions: readonly RecordedResolution[]
): FindingStatuses {
  const result: FindingStatuses = { open: [], resolved: [], statusUnmeasured: [] };
  // No findings means all three sets are empty, even if orphan resolutions exist.
  if (findings.length === 0) return result;
  const targets = new Set(resolutions.map((resolution) => resolution.target));
  for (const finding of findings) {
    const identity = findingIdentity(finding);
    const status = finding['status'];
    const hasResolution = identity !== undefined && targets.has(identity);
    if (hasResolution || hasInlineResolution(finding)) {
      result.resolved.push(finding);
    } else if (status === undefined || (typeof status === 'string' && OPEN_STATUSES.has(status))) {
      result.open.push(finding);
    } else {
      result.statusUnmeasured.push(finding);
    }
  }
  return result;
}
