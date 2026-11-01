/** Behavioral checks for the CI review's result JSON and posted explanation. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext, Script } from 'node:vm';
import { parse } from 'yaml';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { AgentVoteResult } from '../packages/nexus-agents/src/cli/vote-types.js';
import {
  aggregatePrDecisions,
  buildPrReviewProposal,
  mapVoteDecisionToPrDecision,
  PR_REVIEW_ROLES,
  type PrReviewAggregate,
  type PrReviewVote,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-tool.js';
import { toPrReviewVote } from '../packages/nexus-agents/src/mcp/tools/pr-review-result-mapping.js';
import { isFindingVerified } from '../packages/nexus-agents/src/mcp/tools/pr-review-findings.js';

const StepSchema = z.object({
  name: z.string().optional(),
  uses: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string(), z.unknown()).optional(),
  with: z.record(z.string(), z.unknown()).optional(),
});

const JobSchema = z.object({
  name: z.string().optional(),
  needs: z.union([z.string(), z.array(z.string())]).optional(),
  if: z.string().optional(),
  permissions: z.record(z.string(), z.string()).optional(),
  steps: z.array(StepSchema),
});

const WorkflowSchema = z.object({
  name: z.string().optional(),
  on: z.record(z.string(), z.unknown()).optional(),
  permissions: z.record(z.string(), z.string()).optional(),
  jobs: z.record(z.string(), JobSchema),
});
const rawWorkflowContent = readFileSync(
  join(process.cwd(), '.github/workflows/pr-review.yml'),
  'utf8'
);
const workflow = WorkflowSchema.parse(parse(rawWorkflowContent));
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
const invocation = steps.find((step) => step.name === 'Run pr_review tool')?.run;
const commentScript = (
  steps.find((step) => step.name === 'Post review summary as PR comment')?.with as
    | { script?: string }
    | undefined
)?.script;
if (invocation === undefined || commentScript === undefined)
  throw new Error('Review steps missing');
const heredoc = /NODE_EOF'\n([\s\S]*?)\n\s*NODE_EOF/.exec(invocation)?.[1];
if (heredoc === undefined) throw new Error('Review node harness missing');
const inlineScript = heredoc.replace(/^[ \t]*import[\s\S]*?;[^\S\n]*\n?/gm, '');
// Omit console diagnostics from result checks; the complete harness has its own syntax check.
const reviewScript = inlineScript.replace(
  /^[ \t]*console\.(?:log|error)\([\s\S]*?\);[^\S\n]*\n?/gm,
  ''
);
const commentSource: string = commentScript;

interface Result {
  readonly prNumber?: number;
  readonly headSha?: string;
  readonly summary: string;
  readonly verified: boolean;
  readonly reason?: string;
  readonly reviews: readonly PrReviewVote[];
  readonly allErrored?: boolean;
}

async function executeReview(
  votes: readonly AgentVoteResult[],
  aggregate: (reviews: readonly PrReviewVote[]) => PrReviewAggregate = aggregatePrDecisions
): Promise<Result> {
  let output: string | undefined;
  const exited = new Error('Workflow exited');
  try {
    await (runInNewContext(`(async () => { ${reviewScript} })()`, {
      collectRealVotes: () => Promise.resolve(votes),
      buildPrReviewProposal,
      mapVoteDecisionToPrDecision,
      toPrReviewVote,
      isFindingVerified,
      aggregatePrDecisions: aggregate,
      PR_REVIEW_ROLES,
      fs: {
        writeFile: (_path: string, contents: string) => {
          output = contents;
        },
      },
      process: {
        env: {},
        exit: () => {
          throw exited;
        },
      },
      console: { log: () => undefined, error: () => undefined },
    }) as Promise<void>);
  } catch (error: unknown) {
    if (error !== exited) throw error;
  }
  if (output === undefined) throw new Error('Workflow wrote no result');
  return JSON.parse(output) as Result;
}

interface ExecuteCommentOptions {
  readonly artifactContent?: string | null;
  readonly expectedPr?: string;
  readonly expectedHeadSha?: string;
}

async function executeComment(
  result: Result,
  options: ExecuteCommentOptions = {}
): Promise<string> {
  let body: string | undefined;
  const boundResult = {
    prNumber: 4334,
    headSha: 'head-sha-123',
    ...result,
  };
  const content =
    options.artifactContent !== undefined
      ? options.artifactContent
      : JSON.stringify(boundResult);

  await (runInNewContext(`(async () => { ${commentSource} })()`, {
    require: () => ({
      readFileSync: () => {
        if (content === null) {
          throw new Error('ENOENT: no such file or directory');
        }
        return content;
      },
    }),
    process: {
      env: {
        EXPECTED_PR: options.expectedPr ?? '4334',
        EXPECTED_HEAD_SHA: options.expectedHeadSha ?? 'head-sha-123',
      },
      exit: (code: number) => {
        throw new Error(`Process exited with code ${String(code)}`);
      },
    },
    github: {
      rest: {
        issues: {
          createComment: (comment: { body: string }) => {
            body = comment.body;
          },
        },
      },
    },
    context: { repo: { owner: 'owner', repo: 'repo' }, issue: { number: 4334 } },
  }) as Promise<void>);
  if (body === undefined) throw new Error('Workflow posted no comment');
  return body;
}

const reason = 'unconfirmed: 1 reviewer (security) at src/a.ts:10; needs second reviewer';
const unconfirmed = { decision: 'request_changes', verified: false, reason } as const;

function votes(source: 'llm' | 'error' = 'llm'): AgentVoteResult[] {
  return PR_REVIEW_ROLES.map((role) => ({
    role,
    source,
    cli: 'claude',
    processingTimeMs: 1,
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'Reviewed the diff' },
  }));
}

describe('CI pr_review result and comment fidelity (#4334)', () => {
  it('has an executable inline node harness, including console diagnostics', () => {
    expect(() => new Script(`(async () => { ${inlineScript} })()`)).not.toThrow();
  });

  it.each(['llm', 'error'] as const)(
    'preserves aggregate reason in the %s result JSON',
    async (source) => {
      const result = await executeReview(votes(source), () => unconfirmed);
      expect(result.reason).toBe(reason);
      expect(result.allErrored).toBe(source === 'error' ? true : undefined);
    }
  );

  it('carries a verified finding through mapping into the real aggregate', async () => {
    const panel = votes();
    const security = panel.find((vote) => vote.role === 'security');
    if (security === undefined) throw new Error('Security reviewer missing');
    const result = await executeReview(
      panel.map((vote) =>
        vote === security
          ? {
              ...vote,
              vote: {
                decision: 'reject',
                confidence: 0.9,
                reasoning: 'Found a concrete bug',
                findings: [
                  {
                    summary: 'Real defect',
                    location: 'src/a.ts:10',
                    severity: 'high',
                    claim: 'The cited assertion fails for null input',
                    gate: {
                      reread_cited_line: 'passed',
                      traced_call_path: 'passed',
                      named_assertion: 'Throws for null input at src/a.test.ts:10',
                      ruled_out_language_non_issue: 'passed',
                    },
                  },
                ],
              },
            }
          : vote
      )
    );
    expect(result.summary).toBe('request_changes');
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('unconfirmed: 1 reviewer');
    expect(result.reviews.find((review) => review.role === 'security')?.findings[0]?.verified).toBe(
      true
    );
  });

  it('renders the unconfirmed reason without a false majority or absence claim', async () => {
    const body = await executeComment({
      summary: 'request_changes',
      verified: false,
      reason,
      reviews: [],
    });
    expect(body).toContain(`REQUEST CHANGES (UNVERIFIED — ${reason})`);
    expect(body).not.toContain('majority dissent');
    expect(body).not.toContain('none produced a verified finding');
  });

  it('retains the majority dissent explanation when there is no aggregate reason', async () => {
    const body = await executeComment({ summary: 'request_changes', verified: false, reviews: [] });
    expect(body).toContain('REQUEST CHANGES (UNVERIFIED — majority dissent)');
    expect(body).toContain('none produced a verified finding');
  });
});

describe('PR review workflow security boundaries and isolation (#7696)', () => {
  it('triggers on pull_request_target with labeled and synchronize', () => {
    expect(workflow.on).toHaveProperty('pull_request_target');
    expect(workflow.on).not.toHaveProperty('pull_request');
    const prTarget = workflow.on?.['pull_request_target'] as { types?: string[] } | undefined;
    expect(prTarget?.types).toContain('labeled');
    expect(prTarget?.types).toContain('synchronize');
  });

  it('separates review analysis and comment posting into isolated jobs', () => {
    expect(workflow.jobs).toHaveProperty('pr-review');
    expect(workflow.jobs).toHaveProperty('post-comment');
    const postJob = workflow.jobs['post-comment'];
    expect(postJob?.needs).toBe('pr-review');
  });

  it('restricts pr-review job to read-only permissions and does not checkout PR head', () => {
    const reviewJob = workflow.jobs['pr-review'];
    expect(reviewJob?.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
    const checkouts =
      reviewJob?.steps.filter((s) => s.uses?.startsWith('actions/checkout') ?? false) ?? [];
    expect(checkouts.length).toBeGreaterThan(0);
    for (const checkout of checkouts) {
      const refVal = checkout.with?.['ref'];
      const ref = typeof refVal === 'string' ? refVal : '';
      expect(ref).not.toContain('head.sha');
      expect(ref).not.toContain('head.ref');
      expect(checkout.with?.['persist-credentials']).toBe(false);
    }
    const uploadStep = reviewJob?.steps.find(
      (s) => s.uses?.startsWith('actions/upload-artifact') ?? false
    );
    expect(uploadStep).toBeDefined();
  });

  it('restricts post-comment job to write permissions without model secrets or repository checkout', () => {
    const postJob = workflow.jobs['post-comment'];
    expect(postJob?.permissions).toEqual({
      'pull-requests': 'write',
      issues: 'write',
    });
    const checkouts =
      postJob?.steps.filter((s) => s.uses?.startsWith('actions/checkout') ?? false) ?? [];
    expect(checkouts).toHaveLength(0);

    const secretNames = [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_AI_API_KEY',
      'OPENROUTER_API_KEY',
    ];
    for (const step of postJob?.steps ?? []) {
      if (step.env !== undefined) {
        for (const secret of secretNames) {
          expect(step.env).not.toHaveProperty(secret);
        }
      }
    }

    const downloadStep = postJob?.steps.find(
      (s) => s.uses?.startsWith('actions/download-artifact') ?? false
    );
    expect(downloadStep).toBeDefined();
  });

  it('fails closed when artifact is missing, empty, or malformed without calling createComment', async () => {
    // Missing artifact (ENOENT)
    await expect(
      executeComment(
        { summary: 'approve', verified: true, reviews: [] },
        { artifactContent: null }
      )
    ).rejects.toThrow();

    // Empty artifact
    await expect(
      executeComment(
        { summary: 'approve', verified: true, reviews: [] },
        { artifactContent: '' }
      )
    ).rejects.toThrow();

    // Malformed JSON artifact
    await expect(
      executeComment(
        { summary: 'approve', verified: true, reviews: [] },
        { artifactContent: 'not valid json' }
      )
    ).rejects.toThrow();

    // Mismatched PR number
    await expect(
      executeComment(
        { summary: 'approve', verified: true, reviews: [] },
        {
          artifactContent: JSON.stringify({
            prNumber: 9999,
            headSha: 'head-sha-123',
            summary: 'approve',
            verified: true,
            reviews: [],
          }),
          expectedPr: '4334',
          expectedHeadSha: 'head-sha-123',
        }
      )
    ).rejects.toThrow();

    // Mismatched head SHA
    await expect(
      executeComment(
        { summary: 'approve', verified: true, reviews: [] },
        {
          artifactContent: JSON.stringify({
            prNumber: 4334,
            headSha: 'wrong-head-sha',
            summary: 'approve',
            verified: true,
            reviews: [],
          }),
          expectedPr: '4334',
          expectedHeadSha: 'head-sha-123',
        }
      )
    ).rejects.toThrow();
  });
});
