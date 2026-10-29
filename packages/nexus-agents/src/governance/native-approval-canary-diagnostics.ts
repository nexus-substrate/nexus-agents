/** Secret-safe, bounded explanations for a consumed canary attempt. */
import { z } from 'zod';

const OPERATIONS = [
  'repository',
  'protection',
  'pull-request',
  'commit',
  'comparison',
  'tree',
  'blob',
  'checks',
  'statuses',
  'history',
  'reviews',
  'native-status',
  'review-post',
  'unknown',
] as const;
export type CanaryReadOperation = (typeof OPERATIONS)[number];
const KNOWN = new Set([
  'source-identity-mismatch',
  'dirty-checkout',
  'untracked-source',
  'launch-identity-mismatch',
  'ungoverned-source',
  'source-root-override-refused',
  'shadow-codeowners',
  'source-snapshot-evidence-mismatch',
  'preflight-receipt-invalid',
  'preflight-run-not-successful',
  'preflight-run-completion-timeout',
  'preflight-run-provenance-mismatch',
  'duplicate-api-identity',
  'duplicate-pr-history',
  'tree-identity-mismatch',
  'tree-path-unmeasured',
  'file-mode-mismatch',
  'directory-mode-mismatch',
  'empty-canary-path',
  'blob-integrity-mismatch',
  'blob-content-mismatch',
  'commit-ancestry-mismatch',
  'compare-tree-mismatch',
  'canary-api-read-failed',
  'response-limit',
  'pagination-limit',
  'collection-changed',
  'collection-incomplete',
  'active-rulesets-unmeasured',
  'invalid-json',
]);
export interface CanaryFailureCause {
  code: string;
  operation?: CanaryReadOperation;
  httpStatus?: number;
  fields?: readonly string[];
  omittedFieldErrors?: number;
}

const REVIEW_RECEIPT_FAILURES = new Map([
  ['Invalid review receipt JSON', 'review-receipt-json-invalid'],
  ['Invalid review receipt fields', 'review-receipt-fields-invalid'],
  ['Review receipt does not match requested commit and decision', 'review-receipt-mismatch'],
]);

export class CanaryReadFailure extends Error {
  readonly operation: CanaryReadOperation;
  readonly httpStatus: number | undefined;
  constructor(code: string, operation: CanaryReadOperation, httpStatus?: number) {
    super(KNOWN.has(code) ? code : 'unexpected-error');
    this.name = 'CanaryReadFailure';
    this.operation = OPERATIONS.includes(operation) ? operation : 'unknown';
    this.httpStatus =
      Number.isInteger(httpStatus) && (httpStatus ?? 0) >= 100 && (httpStatus ?? 0) <= 599
        ? httpStatus
        : undefined;
  }
}

function schemaCause(error: z.ZodError): CanaryFailureCause {
  const fields = error.issues.slice(0, 10).map((issue) =>
    issue.path
      .slice(0, 8)
      .map((part) => {
        if (typeof part === 'number') return String(part);
        return typeof part === 'string' && /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(part)
          ? part
          : '<field>';
      })
      .join('.')
  );
  const omitted = Math.max(0, error.issues.length - fields.length);
  return {
    code: 'invalid-evidence-shape',
    fields,
    ...(omitted > 0 ? { omittedFieldErrors: omitted } : {}),
  };
}

/** Unknown messages and values are intentionally never copied into evidence. */
export function canaryFailureCause(error: unknown): CanaryFailureCause {
  if (error instanceof CanaryReadFailure)
    return {
      code: error.message,
      operation: error.operation,
      ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
    };
  if (error instanceof z.ZodError) return schemaCause(error);
  if (error instanceof SyntaxError) return { code: 'invalid-json' };
  if (error instanceof Error) {
    const code = REVIEW_RECEIPT_FAILURES.get(error.message);
    if (code !== undefined) return { code, operation: 'review-post' };
  }
  if (error instanceof Error && KNOWN.has(error.message)) return { code: error.message };
  return { code: 'unexpected-error' };
}

const ENDPOINTS: readonly [RegExp, CanaryReadOperation][] = [
  [/\/rules\/branches\//, 'protection'],
  [/\/git\/commits\//, 'commit'],
  [/\/compare\//, 'comparison'],
  [/\/git\/trees\//, 'tree'],
  [/\/git\/blobs\//, 'blob'],
  [/\/check-runs(?:\?|$)/, 'checks'],
  [/\/commits\/[^/]+\/status(?:\?|$)/, 'statuses'],
  [/\/actions\/workflows\//, 'history'],
  [/\/pulls\/[^/]+\/reviews(?:\?|$)/, 'reviews'],
  [/\/pulls(?:\/|\?|$)/, 'pull-request'],
  [/^repos\/nexus-substrate\/nexus-agents\/?$/, 'repository'],
];
/** Classify only endpoint names; query bodies and argv values are not returned. */
export function canaryReadOperation(args: readonly string[]): CanaryReadOperation {
  if (args[1] === 'graphql') {
    if (args.some((arg) => arg.includes('defaultBranchRef'))) return 'protection';
    return args.some((arg) => arg.includes('pullRequest(')) ? 'native-status' : 'unknown';
  }
  const endpoint = args.find((arg) => arg.startsWith('repos/nexus-substrate/nexus-agents')) ?? '';
  for (const [pattern, operation] of ENDPOINTS) {
    if (pattern.test(endpoint)) return operation;
  }
  return 'unknown';
}
