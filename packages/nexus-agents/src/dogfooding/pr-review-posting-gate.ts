/**
 * The DraftReply's verdict before a review is posted (#5383).
 *
 * One firewall run with the action and the review's posture; the decision is
 * `FirewallResult.policy`, read through `evaluateActionThroughFirewall`, so
 * the PR path has ONE policy composition — the firewall — rather than a direct
 * `evaluatePolicy` call beside it. Extracted from `pr-reviewer.ts`, which sits
 * at its `max-lines` budget.
 *
 * @module dogfooding/pr-review-posting-gate
 */

import type { ILogger } from '../core/index.js';
import { validateAgentAction, type SourceCitation } from '../security/action-schema.js';
import { validateCorroboration } from '../security/corroboration-validator.js';
import type { GitHubInput } from '../security/firewall/github-adapter.js';
import type { FirewallProcessOptions } from '../security/firewall/firewall-types.js';
import type { TrustTier } from '../security/trust-types.js';
import { reportUnverifiedCorroboration } from './pr-review-citations.js';
import type { ReviewPostingVerdict } from './pr-reviewer-helpers.js';
import { evaluateActionThroughFirewall } from './untrusted-input-firewall.js';

/** A verdict for a DraftReply that never reached a policy decision. */
function notEvaluated(rule: string, message: string): ReviewPostingVerdict {
  return { allowed: false, hasRuleOfTwoViolation: false, violations: [{ rule, message }] };
}

/**
 * Builds the DraftReply for `body` and `sources`, runs it through the
 * firewall, and folds the corroboration check into the posting verdict.
 *
 * Every way the run can END WITHOUT a decision — an invalid action, or a
 * firewall call that failed closed (a non-policy error, a policy stage that
 * did not evaluate the action, a run that enforced a different tier than the
 * classification) — is a synthetic blocking violation, so the review is NOT
 * posted and the reason names why. A refusal under `enforce` carries the rules
 * it refused on; under `off` and `audit` the caller enforces `allowed`.
 */
export function auditReviewAction(
  draft: { readonly body: string; readonly sources: readonly SourceCitation[] },
  input: GitHubInput,
  gate: Pick<FirewallProcessOptions, 'context' | 'reputation'> & {
    readonly enforcedTier: TrustTier;
  },
  log: Pick<ILogger, 'warn'>
): ReviewPostingVerdict {
  const validated = validateAgentAction({
    type: 'DraftReply',
    body: draft.body,
    requiresApproval: true,
    sources: draft.sources,
  });
  if (!validated.ok) return notEvaluated('INVALID_ACTION', validated.error);
  const decision = evaluateActionThroughFirewall(input, { ...gate, action: validated.value });
  if (!decision.ok) return notEvaluated('FIREWALL_ERROR', decision.error.message);
  const corroboration = validateCorroboration(validated.value);
  reportUnverifiedCorroboration(corroboration, log);
  const corroborationViolation = corroboration.satisfied
    ? []
    : [{ rule: 'INSUFFICIENT_CORROBORATION', message: corroboration.missing.join('; ') }];
  return {
    allowed: decision.value.allowed && corroboration.satisfied,
    hasRuleOfTwoViolation: decision.value.violations.some((v) => v.rule === 'RULE_OF_TWO'),
    violations: [...decision.value.violations, ...corroborationViolation],
  };
}
