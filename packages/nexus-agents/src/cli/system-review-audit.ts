/** Pure interpretation of pinned pnpm audit output and its local execution evidence. */
import { z } from 'zod';

const MAX_AUDIT_OUTPUT_BYTES = 1024 * 1024;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const reportSchema = z.object({
  error: z.never().optional(),
  errors: z.never().optional(),
  metadata: z.object({
    vulnerabilities: z
      .object({
        info: count,
        low: count,
        moderate: count,
        high: count,
        critical: count,
        total: count.optional(),
      })
      .strict(),
  }),
});

type Counts = Readonly<
  Omit<z.infer<typeof reportSchema>['metadata']['vulnerabilities'], 'total'> & {
    total: number;
  }
>;
type Reason =
  | 'missing-output'
  | 'execution-failed'
  | 'output-too-large'
  | 'invalid-json'
  | 'invalid-counts'
  | 'inconsistent-report';
interface Unmeasured {
  readonly status: 'unmeasured';
  readonly reason: Reason;
  /** Absent means the execution status was unavailable, never an inferred zero. */
  readonly exitCode?: number;
}
export type PnpmAuditObservation =
  { readonly status: 'measured'; readonly exitCode: 0 | 1; readonly counts: Counts } | Unmeasured;

interface CompletedOutput {
  readonly stdout: string;
  readonly exitCode: 0 | 1;
}

function unavailable(reason: Reason, exitCode?: number): Unmeasured {
  return { status: 'unmeasured', reason, ...(exitCode === undefined ? {} : { exitCode }) };
}

function knownExitCode(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255
    ? value
    : undefined;
}

function wasTerminated(error: object): boolean {
  const signal = 'signal' in error && error.signal !== undefined && error.signal !== null;
  const killed = 'killed' in error && error.killed !== undefined && error.killed !== false;
  return signal || killed;
}

function hasExecutionErrorCode(error: object): boolean {
  return 'code' in error && error.code !== undefined && error.code !== 1;
}

function readFindingsOutput(error: object): CompletedOutput | Unmeasured {
  const exitCode = knownExitCode('status' in error ? error.status : undefined);
  if (exitCode !== 1 || wasTerminated(error) || hasExecutionErrorCode(error)) {
    return unavailable('execution-failed', exitCode);
  }
  if (!('stdout' in error) || typeof error.stdout !== 'string') {
    return unavailable('execution-failed', exitCode);
  }
  return { stdout: error.stdout, exitCode };
}

function readExecution(execution: unknown): CompletedOutput | Unmeasured {
  if (typeof execution === 'string') return { stdout: execution, exitCode: 0 };
  if (execution === undefined || execution === null) return unavailable('missing-output');
  return typeof execution === 'object'
    ? readFindingsOutput(execution)
    : unavailable('execution-failed');
}

function isConsistentTotal(computed: number, reported: number | undefined): boolean {
  return Number.isSafeInteger(computed) && (reported === undefined || reported === computed);
}

/**
 * Interpret successful stdout or the original thrown synchronous subprocess error.
 * A string is only for a completed exit 0; retain the error object for exit 1 so
 * signal, timeout and process failures cannot be laundered through captured stdout.
 * The caller executes the command; this function performs no IO or logging.
 */
export function parsePnpmAuditResult(execution: unknown): PnpmAuditObservation {
  const completed = readExecution(execution);
  if ('status' in completed) return completed;
  const { stdout, exitCode } = completed;
  if (Buffer.byteLength(stdout, 'utf8') > MAX_AUDIT_OUTPUT_BYTES) {
    return unavailable('output-too-large', exitCode);
  }
  if (stdout.trim() === '') return unavailable('missing-output', exitCode);
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return unavailable('invalid-json', exitCode);
  }
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return unavailable('invalid-counts', exitCode);
  const { total: reportedTotal, ...counts } = parsed.data.metadata.vulnerabilities;
  // These five required counters are the producer's complete, nonempty severity set.
  const total = counts.info + counts.low + counts.moderate + counts.high + counts.critical;
  if (!isConsistentTotal(total, reportedTotal)) {
    return unavailable('invalid-counts', exitCode);
  }
  if (exitCode === 1 && total === 0) return unavailable('inconsistent-report', exitCode);
  return { status: 'measured', exitCode, counts: { ...counts, total } };
}
