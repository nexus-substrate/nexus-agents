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

const WorkflowSchema = z.object({
  jobs: z.record(
    z.string(),
    z.object({
      steps: z.array(
        z.object({
          name: z.string().optional(),
          run: z.string().optional(),
          with: z.object({ script: z.string().optional() }).optional(),
        })
      ),
    })
  ),
});
const workflow = WorkflowSchema.parse(
  parse(readFileSync(join(process.cwd(), '.github/workflows/pr-review.yml'), 'utf8'))
);
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
const invocation = steps.find((step) => step.name === 'Run pr_review tool')?.run;
const commentScript = steps.find((step) => step.name === 'Post review summary as PR comment')?.with
  ?.script;
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

async function executeComment(result: Result): Promise<string> {
  let body: string | undefined;
  await (runInNewContext(`(async () => { ${commentSource} })()`, {
    require: () => ({ readFileSync: () => JSON.stringify(result) }),
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
