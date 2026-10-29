/** Bounded schema for measured native canary evidence. Missing fields are not defaults. */
import { z } from 'zod';

const MAX_ROWS = 1000;
const Text = z.string().min(1).max(1024);
const Id = z.number().int().positive();
const Sha = z
  .string()
  .length(40)
  .regex(/^[0-9a-f]+$/);
const Digest = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]+$/);
const Complete = z.object({ complete: z.boolean() });
const CheckIdentity = z.object({ name: Text, appId: Id }).strict();

export const CanaryEvidenceSchema = z
  .object({
    repository: z.object({ id: Id, ownerId: Id, name: Text, defaultBranch: Text }).strict(),
    invocation: z
      .object({
        actorId: Id,
        event: Text,
        ref: Text,
        workflowPath: Text,
        workflowSha: Sha,
        checkoutSha: Sha,
        runId: Id,
        runAttempt: Id,
      })
      .strict(),
    preflight: Complete.extend({
      complete: z.literal(true),
      actorId: Id,
      event: z.literal('workflow_dispatch'),
      ref: z.literal('refs/heads/main'),
      workflowPath: Text,
      workflowSha: Sha,
      runId: Id,
      runAttempt: z.literal(1),
      observedMainSha: Sha,
      prNumber: Id,
      headSha: Sha,
      baseSha: Sha,
      querySha256: Digest,
      responseSha256: Digest,
    }).strict(),
    expected: z.object({ pr: Id, headSha: Sha, baseSha: Sha }).strict(),
    mainSha: Sha,
    latestMainSha: Sha,
    commit: Complete.extend({
      sha: Sha,
      parents: z.array(Sha).max(MAX_ROWS),
      treeSha: Sha,
    }).strict(),
    pr: z
      .object({
        number: Id,
        authorId: Id,
        state: Text,
        draft: z.boolean(),
        headRepoId: Id,
        baseRepoId: Id,
        headRef: Text,
        baseRef: Text,
        headSha: Sha,
        baseSha: Sha,
        changedFiles: z.number().int().nonnegative(),
        autoMerge: z.boolean(),
      })
      .strict(),
    latestPR: z
      .object({
        number: Id,
        state: Text,
        draft: z.boolean(),
        headSha: Sha,
        baseSha: Sha,
        autoMerge: z.boolean(),
      })
      .strict(),
    files: Complete.extend({
      treeSha: Sha,
      items: z
        .array(
          z
            .object({
              path: Text,
              status: Text,
              mode: Text,
              content: z.string().max(1024),
              blobSha: Sha,
            })
            .strict()
        )
        .max(MAX_ROWS),
    }).strict(),
    governor: Complete.extend({
      patternCount: z.number().int().nonnegative(),
      files: z.array(Text).max(MAX_ROWS),
      matches: z.array(Text).max(MAX_ROWS),
    }).strict(),
    checks: Complete.extend({
      statuses: z
        .array(z.object({ context: Text, headSha: Sha, state: Text }).strict())
        .max(MAX_ROWS),
      items: z
        .array(
          CheckIdentity.extend({
            headSha: Sha,
            status: Text,
            conclusion: z.string().nullable(),
          }).strict()
        )
        .max(MAX_ROWS),
    }).strict(),
    protection: z
      .object({
        strict: z.boolean(),
        reviews: z.number().int().nonnegative(),
        dismissStale: z.boolean(),
        codeOwner: z.boolean(),
        lastPush: z.boolean(),
        forcePushes: z.boolean(),
        deletions: z.boolean(),
        requiredChecks: z.array(CheckIdentity).max(MAX_ROWS),
        snapshotSha256: Digest,
        latestSnapshotSha256: Digest,
      })
      .strict(),
    history: Complete.extend({
      runs: z
        .array(z.object({ id: Id, event: Text, ref: Text, attempt: Id, actorId: Id }).strict())
        .max(MAX_ROWS),
      branchPRs: z.array(Id).max(MAX_ROWS),
    }).strict(),
    reviews: Complete.extend({
      items: z
        .array(
          z
            .object({
              id: Id,
              authorId: Id,
              authorLogin: Text,
              authorType: Text,
              state: Text,
              commitSha: Sha,
            })
            .strict()
        )
        .max(MAX_ROWS),
    }).strict(),
  })
  .strict();

export type NativeCanaryEvidence = z.infer<typeof CanaryEvidenceSchema>;
