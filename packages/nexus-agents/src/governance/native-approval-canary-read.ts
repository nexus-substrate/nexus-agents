/** Bounded GitHub evidence reads. No write or credential escalation lives here. */
import { createHash } from 'node:crypto';
import { CanaryReadFailure, canaryReadOperation } from './native-approval-canary-diagnostics.js';
import { z } from 'zod';
import { execGhApiRaw } from '../scm/github-api-transport.js';
import type { NativeCanaryEvidence } from './native-approval-canary.js';
import { NATIVE_CANARY_POLICY } from './native-approval-canary.js';

export type CanaryRead = (args: readonly string[]) => Promise<unknown>;
export const CanarySha = z.string().regex(/^[0-9a-f]{40}$/);
export const CanaryId = z.number().int().positive();
const PREFIX = `repos/${NATIVE_CANARY_POLICY.repository}/`;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** Shared canonical SCM transport; errors deliberately omit API bodies and credentials. */
export const readCanaryJson: CanaryRead = async (args) => {
  const response = await execGhApiRaw(args);
  const operation = canaryReadOperation(args);
  if (!response.ok)
    throw new CanaryReadFailure('canary-api-read-failed', operation, response.error.statusCode);
  if (Buffer.byteLength(response.value) > 10 * 1024 * 1024)
    throw new CanaryReadFailure('response-limit', operation);
  try {
    return JSON.parse(response.value) as unknown;
  } catch {
    throw new CanaryReadFailure('invalid-json', operation);
  }
};

/** A short last page proves completion. Exhausting the bound never does. */
export async function readCanaryPages<T>(
  read: CanaryRead,
  endpoint: string,
  schema: z.ZodType<T>
): Promise<T[]> {
  const result: T[] = [];
  const separator = endpoint.includes('?') ? '&' : '?';
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await read([
      'api',
      '--method',
      'GET',
      `${PREFIX}${endpoint}${separator}per_page=${String(PAGE_SIZE)}&page=${String(page)}`,
    ]);
    const rows = z.array(schema).max(PAGE_SIZE).parse(data);
    result.push(...rows);
    if (rows.length < PAGE_SIZE) return result;
  }
  throw new Error('pagination-limit');
}

/** Counted envelopes must agree with both pagination and the measured row count. */
export async function readCanaryCountedPages<T>(
  read: CanaryRead,
  endpoint: string,
  field: 'check_runs' | 'workflow_runs' | 'statuses',
  schema: z.ZodType<T>
): Promise<T[]> {
  let expected: number | undefined;
  const rows = await readCanaryPages(
    async (args) => {
      const envelope = z
        .object({ total_count: z.number().int().min(0).max(1000) })
        .catchall(z.unknown())
        .parse(await read(args));
      if (expected !== undefined && expected !== envelope.total_count)
        throw new Error('collection-changed');
      expected = envelope.total_count;
      return envelope[field];
    },
    endpoint,
    schema
  );
  if (expected === undefined || rows.length !== expected) throw new Error('collection-incomplete');
  return rows;
}

export async function readCanaryGet<T>(
  read: CanaryRead,
  endpoint: string,
  schema: z.ZodType<T>
): Promise<T> {
  return schema.parse(await read(['api', '--method', 'GET', `${PREFIX}${endpoint}`]));
}

const Rule = z
  .object({
    pattern: z.literal('main'),
    requiresApprovingReviews: z.literal(true),
    requiredApprovingReviewCount: z.number().int().nonnegative(),
    dismissesStaleReviews: z.boolean(),
    requiresCodeOwnerReviews: z.boolean(),
    requireLastPushApproval: z.boolean(),
    requiresStrictStatusChecks: z.boolean(),
    requiresStatusChecks: z.literal(true),
    allowsForcePushes: z.boolean(),
    allowsDeletions: z.boolean(),
    requiredStatusChecks: z
      .array(z.object({ context: z.string().min(1), app: z.object({ databaseId: CanaryId }) }))
      .max(1000),
  })
  .loose();
const ProtectionResponse = z.object({
  data: z.object({
    repository: z.object({
      defaultBranchRef: z.object({
        name: z.literal('main'),
        target: z.object({ oid: CanarySha }),
        branchProtectionRule: Rule,
      }),
    }),
  }),
  errors: z.never().optional(),
});
const PROTECTION_QUERY = `query { repository(owner:"nexus-substrate",name:"nexus-agents") {
  defaultBranchRef { name target { oid } branchProtectionRule {
    pattern requiresApprovingReviews requiredApprovingReviewCount dismissesStaleReviews
    requiresCodeOwnerReviews requireLastPushApproval requiresStrictStatusChecks requiresStatusChecks
    allowsForcePushes allowsDeletions requiredStatusChecks { context app { databaseId } }
  } } } }`;

/** Classic protection and active inherited rules are separate GitHub surfaces. */
export async function readCanaryProtection(read: CanaryRead): Promise<{
  mainSha: string;
  protection: NativeCanaryEvidence['protection'];
}> {
  const response = ProtectionResponse.parse(
    await read(['api', 'graphql', '-f', `query=${PROTECTION_QUERY}`])
  );
  const rules = await readCanaryPages(read, 'rules/branches/main', z.unknown());
  if (rules.length !== 0) throw new Error('active-rulesets-unmeasured');
  const branch = response.data.repository.defaultBranchRef;
  const rule = branch.branchProtectionRule;
  const digest = createHash('sha256').update(JSON.stringify({ rule, rules })).digest('hex');
  return {
    mainSha: branch.target.oid,
    protection: {
      strict: rule.requiresStrictStatusChecks,
      reviews: rule.requiredApprovingReviewCount,
      dismissStale: rule.dismissesStaleReviews,
      codeOwner: rule.requiresCodeOwnerReviews,
      lastPush: rule.requireLastPushApproval,
      forcePushes: rule.allowsForcePushes,
      deletions: rule.allowsDeletions,
      requiredChecks: rule.requiredStatusChecks.map((check) => ({
        name: check.context,
        appId: check.app.databaseId,
      })),
      snapshotSha256: digest,
      latestSnapshotSha256: digest,
    },
  };
}
