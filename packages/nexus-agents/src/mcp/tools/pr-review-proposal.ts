/**
 * Proposal construction for `pr_review`.
 *
 * Extracted from `pr-review-tool.ts` (#5385), which sat at 398 of its 400-line
 * budget — threading the sanitization disclosure through pushed it over, and
 * this is the cohesive piece to move, because the builder IS the sanitization
 * concern. A pure move apart from the `removedBeforeThisCall` parameter that
 * issue adds.
 *
 * `pr-review-tool.ts` re-exports the symbol, so both barrels
 * (`mcp/index.ts`, `mcp/tools/index.ts`), the published `exports/mcp.ts`, and
 * `scripts/pr-review-local.ts` / `scripts/pr-review-eval-run.ts` keep importing
 * it unchanged. The `PrReviewInput` import is type-only and therefore erased,
 * so the re-export creates no runtime cycle.
 *
 * @module mcp/tools/pr-review-proposal
 */

import { sanitizeToolInput } from '../middleware/tool-input-sanitizer.js';
import { FINDINGS_FORMAT_INSTRUCTIONS } from './pr-review-findings.js';
import type { PrReviewInput } from './pr-review-tool.js';

/** Builds the proposal text passed to voters. The voters are designed for
 * yes/no proposals — by framing the diff as "should this PR be merged?" we
 * get usable output without needing new system prompts (Child 3 will add
 * those).
 *
 * **Sanitization lives HERE, not at the tool boundary (#5258 item B).** The
 * `securityTier: 'external'` declared on the registered tool only protects the
 * MCP path, because the middleware is constructed inside `registerPrReviewTool`.
 * Three other callers reach the voters without it — `.github/workflows/
 * pr-review.yml`, `scripts/pr-review-local.ts` (the documented default path)
 * and `scripts/pr-review-eval-run.ts` — each importing this builder directly
 * from `dist/index.js`. On those paths a hostile PR body reached five voters
 * unfenced, next to the words "should it be merged as-is?".
 *
 * This function is the one chokepoint all four callers pass through, so the
 * protection is attached to the data rather than to one entry point. The MCP
 * tier check still runs earlier and still refuses; this is the floor beneath
 * it, and it strips rather than refuses so the script paths degrade instead of
 * failing shut. Double-sanitizing on the MCP path is idempotent and harmless.
 */
export function buildPrReviewProposal(
  input: Pick<
    PrReviewInput,
    'prTitle' | 'prDescription' | 'prDiff' | 'repoContext' | 'baseRef' | 'headRef'
  >,
  removedBeforeThisCall = 0
): string {
  // Every field below is attacker-controlled on the CI path: title, body and
  // diff all come straight from `github.event.pull_request.*`.
  const sanitizeResult = sanitizeToolInput({
    prTitle: input.prTitle,
    prDescription: input.prDescription,
    prDiff: input.prDiff,
    repoContext: input.repoContext,
  });
  const safe = sanitizeResult.sanitized as Pick<
    PrReviewInput,
    'prTitle' | 'prDescription' | 'prDiff' | 'repoContext'
  >;

  const parts: string[] = [];
  parts.push(`# Pull Request Review\n`);

  // The proposal a voter reads is not always the PR as written. Say so IN the
  // proposal rather than only in a log, because the proposal is what the panel
  // sees and what the governance record preserves — a voter told "approve if
  // the diff is correct and complete" would otherwise judge a silently
  // shortened body as if it were whole. On the CI and script paths there is no
  // secure-handler log at all, so without this the removal leaves no trace.
  // #5385: SUM both stages. The MCP path strips in the middleware (this call
  // then counts 0); the CI and script paths strip here (nothing before).
  const totalRemoved = sanitizeResult.commentsRemoved + removedBeforeThisCall;
  if (totalRemoved > 0) {
    parts.push(
      `> **Note:** ${String(totalRemoved)} HTML comment(s) were removed ` +
        `from the untrusted fields below before you saw them (#5258). Comments are invisible ` +
        `in rendered markdown, so they are stripped rather than trusted. This is routine — ` +
        `GitHub's default PR template contains one — and is not by itself evidence of an attack.\n`
    );
  }

  parts.push(`**Title:** ${safe.prTitle}\n`);

  // baseRef/headRef are git ref names, not free text, and are validated
  // upstream; they are interpolated as-is deliberately.
  if (input.baseRef !== undefined && input.headRef !== undefined) {
    parts.push(`**Branches:** ${input.headRef} → ${input.baseRef}\n`);
  }
  if (safe.repoContext !== undefined && safe.repoContext !== '') {
    parts.push(`\n**Repo context:**\n${safe.repoContext}\n`);
  }
  if (safe.prDescription !== undefined && safe.prDescription !== '') {
    parts.push(`\n**Description:**\n${safe.prDescription}\n`);
  }

  parts.push(`\n## Diff\n\n\`\`\`diff\n${safe.prDiff}\n\`\`\`\n`);
  parts.push(`\n## Your task\n`);
  parts.push(`Review this PR from your role's perspective. Decide: should it be merged as-is?\n`);
  parts.push(`- **APPROVE** if the diff is correct, complete, and aligned with your role.\n`);
  parts.push(
    `- **REJECT** (= "request changes") if there is at least one concrete defect, missing requirement, or violation that justifies blocking the merge.\n`
  );
  parts.push(`- **ABSTAIN** if the diff is outside your role's concerns.\n`);
  parts.push(`\n${FINDINGS_FORMAT_INSTRUCTIONS}\n`);

  return parts.join('');
}
