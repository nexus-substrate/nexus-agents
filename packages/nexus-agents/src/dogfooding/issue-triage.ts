/**
 * nexus-agents/dogfooding - Issue Triage Processor
 *
 * Deterministic GitHub issue triage using the full security pipeline:
 * - Input sanitization (input-sanitizer.ts)
 * - Trust classification (trust-classifier.ts)
 * - Reputation assessment (reputation-model.ts) [NEW — #828]
 * - Typed agent actions (action-schema.ts)
 * - Policy gate validation (policy-gate.ts)
 * - Corroboration validation (corroboration-validator.ts) [NEW — #828]
 *
 * Read-only by default (dryRun: true). Proposes actions but never
 * auto-posts to GitHub without explicit opt-in.
 *
 * @module dogfooding/issue-triage
 * (Source: Issue #828 — Wire remaining security modules)
 */

import type { Result } from '../core/index.js';
import { ok, err, createLogger, getTimeProvider } from '../core/index.js';
import { sanitizeInput } from '../security/input-sanitizer.js';
import { hasToken } from '../scm/token-resolver.js';
import type { ClassifyResult } from '../security/trust-classifier.js';
import type { FirewallResult } from '../security/firewall/firewall-pipeline.js';
import { runUntrustedInputFirewall } from './untrusted-input-firewall.js';
import type { TrustTier } from '../security/trust-types.js';
import { evaluatePolicy } from '../security/policy-gate.js';
import type { ActionContext } from '../security/policy-gate.js';
import { validateCorroboration } from '../security/corroboration-validator.js';
import { assessReputation, ReputationCache } from '../security/reputation-model.js';
import type {
  ReputationAssessment,
  GitHubUserMetadata,
  ReputationGateDecision,
} from '../security/reputation-model.js';
import type { AgentAction, SourceCitation } from '../security/action-schema.js';
import { parseIssueUrl } from '../scm/url-parsers.js';
import { createFullGitHubProvider } from '../scm/github-provider-traits.js';
import type { ScmUserMetadata } from '../scm/types.js';
import {
  buildActionDetails,
  categorizeIssue,
  describeAction,
  extractLabelsFromBody,
  mapIssueComments,
} from './issue-triage-helpers.js';
import type {
  IssueMetadata,
  IssueComment,
  IssueTriageConfig,
  IssueTriageResult,
  ProposedAction,
  TrustAssessment,
} from './issue-triage-types.js';
import { DEFAULT_ISSUE_TRIAGE_CONFIG } from './issue-triage-types.js';

const logger = createLogger({ component: 'IssueTriage' });

/**
 * Applies the two safety actions the untrusted-input rules mandate (#4667).
 *
 * They are mutually exclusive by construction: a hostile tier refuses, a
 * suspicious-but-not-hostile one escalates. Emitting both would ask a human to
 * approve something the system has already declined.
 */
function applySafetyActions(
  actions: readonly AgentAction[],
  gateDecision: ReputationGateDecision,
  reputation: ReputationAssessment | undefined,
  issue: IssueMetadata
): AgentAction[] {
  const withRefusal = appendRefusalIfHostile(actions, gateDecision, issue);
  return appendApprovalIfBorderline(withRefusal, gateDecision, reputation, issue);
}

/**
 * Appends a `RequestHumanApproval` for suspicious-but-not-hostile input (#4667).
 *
 * Triage was binary: tier 4 refuses, everything else proceeds. That left no way
 * to express the common real case — reputation noticed something (a new
 * account, rapid comments, a weak signal) without it amounting to hostility.
 * Those proposals are not safe to auto-apply and not fair to refuse, so they
 * escalate.
 *
 * Deliberately mutually exclusive with the refusal: a hostile tier already
 * emits `RefuseAction`, and stacking "refused" with "please approve" would ask
 * a human to approve something the system just declined.
 */
function appendApprovalIfBorderline(
  actions: readonly AgentAction[],
  gateDecision: ReputationGateDecision,
  reputation: ReputationAssessment | undefined,
  issue: IssueMetadata
): AgentAction[] {
  if (gateDecision.enforcedTier === '4') return [...actions];
  // Tier 1 is the allowlist escape hatch — asking a maintainer to approve a
  // maintainer's own issue is noise, and it would undo the "allowlist wins"
  // guarantee that tier exists to provide.
  if (gateDecision.enforcedTier === '1') return [...actions];
  if (reputation?.isSuspicious !== true) return [...actions];

  // `no_prior_contributions` counts the author's comments ON THIS ISSUE
  // (`countAuthorComments(author, comments)`), so a freshly filed issue always
  // trips it — it is true for essentially every new issue and therefore carries
  // no information. Escalating on it alone would escalate on everything, which
  // is how an approval gate becomes noise and then gets ignored. Require at
  // least one signal that actually distinguishes this author.
  const distinguishing = reputation.suspiciousSignals.filter(
    (sig) => sig !== 'no_prior_contributions'
  );
  if (distinguishing.length === 0) return [...actions];

  const signals = distinguishing.join(', ');
  return [
    ...actions,
    {
      type: 'RequestHumanApproval',
      reason:
        `Issue #${String(issue.number)} carries suspicious reputation signals but did not ` +
        `reach the hostile tier. Proposed actions need a human decision.`,
      context:
        `Author ${issue.author} at enforced tier ${gateDecision.enforcedTier} ` +
        `(${gateDecision.mode} mode). Signals: ${signals.length > 0 ? signals : '(none recorded)'}.`,
    },
  ];
}

/**
 * Appends an explicit `RefuseAction` when the enforced tier is hostile (#4667).
 *
 * The generated actions are kept rather than replaced: they are the audit trail
 * of what was declined, and every one of them is already blocked by the policy
 * gate at tier 4. What was missing is a positive statement that the input was
 * refused and where to escalate it.
 */
function appendRefusalIfHostile(
  actions: readonly AgentAction[],
  gateDecision: ReputationGateDecision,
  issue: IssueMetadata
): AgentAction[] {
  if (gateDecision.enforcedTier !== '4') return [...actions];
  return [
    ...actions,
    {
      type: 'RefuseAction',
      reason:
        `Issue #${String(issue.number)} was classified at hostile trust tier 4 ` +
        `(${gateDecision.mode} mode). Automated triage actions are withheld pending human review.`,
      escalateTo: 'security',
    },
  ];
}

/**
 * GitHub issue triage processor.
 *
 * Wires all 8 security modules into a read-only triage pipeline:
 * 1. Fetch issue + comments from GitHub API
 * 2. Sanitize untrusted content (input-sanitizer)
 * 3. Classify author trust (trust-classifier)
 * 4. Assess author reputation (reputation-model) [#828]
 * 5. Generate typed actions (action-schema)
 * 6. Validate through policy gate (policy-gate)
 * 7. Validate corroboration (corroboration-validator) [#828]
 * 8. Return proposed actions
 */
export class IssueTriage {
  private readonly config: IssueTriageConfig;
  private readonly reputationCache: ReputationCache;

  constructor(config?: Partial<IssueTriageConfig>) {
    this.config = { ...DEFAULT_ISSUE_TRIAGE_CONFIG, ...config };
    this.reputationCache = new ReputationCache();
  }

  /**
   * Triages a GitHub issue through the full security pipeline.
   */
  async triageIssue(issueUrl: string): Promise<Result<IssueTriageResult, Error>> {
    const startTime = getTimeProvider().now();

    logger.info('Starting issue triage', { issueUrl });

    const parseResult = parseIssueUrl(issueUrl);
    if (!parseResult.ok) return parseResult;

    const { owner, repo, issueNumber } = parseResult.value;

    const fetchResult = await this.fetchIssueData(owner, repo, issueNumber);
    if (!fetchResult.ok) return fetchResult;

    const { issue: issueResult, existingLabels } = fetchResult.value;

    // Sanitize untrusted content (Issue #828 — input-sanitizer wiring)
    const safeTitle = this.sanitizeContent(issueResult.title, issueResult.author);
    const safeBody = this.sanitizeContent(issueResult.body, issueResult.author);

    // Reputation is measured here, with data the firewall cannot see (account
    // age, comment history), and handed to the firewall per call.
    const reputation = this.assessAuthorReputation(fetchResult.value);

    // #4992: classify through the shared HostileInputFirewall so the trust
    // decision reaches the security audit trail. Signal-only under the default
    // NEXUS_FIREWALL_POLICY=off; `validateActions` below stays the Rule-of-Two
    // enforcement point. The firewall runs the ONE reputation gate (#3122:
    // off/audit/enforce; audit reports a would-be demotion without enforcing
    // it; the allowlist Tier 1 remains the escape hatch), so its Rule-of-Two
    // signal and this path's policy gate act on the same enforced tier.
    const firewall = this.classifyAuthor(issueResult, reputation);
    if (!firewall.ok) return firewall;
    const trustResult = firewall.value.trust;
    const gateDecision = firewall.value.reputationGate;
    if (gateDecision === undefined) {
      // Structurally unreachable — the option is always passed — but a missing
      // gate must not be papered over with the classifier tier.
      return err(new Error('Untrusted-input firewall returned no reputation gate decision'));
    }
    if (gateDecision.demotionSuppressed) {
      logger.warn('Reputation demotion suppressed by gating mode (would block under enforce)', {
        issueNumber,
        author: issueResult.author,
        mode: gateDecision.mode,
        classifierTier: trustResult.trustTier,
        reconciledTier: gateDecision.reconciledTier,
      });
    }

    // Generate and validate actions
    const actions = this.generateActions(safeTitle, safeBody, issueResult, trustResult);
    // #4667: a hostile enforced tier must produce an explicit refusal. Before
    // this, tier 4 merely meant every generated action failed the policy gate —
    // the caller saw fewer approved actions and no statement that anything was
    // refused, so the fail-closed escalation the rules mandate had no producer.
    // RefuseAction is tier-4 "always allowed" (trust-classifier.ts:170), so it
    // survives the gate that blocks the rest.
    const withEscalation = applySafetyActions(actions, gateDecision, reputation, issueResult);
    const validatedActions = this.validateActions(withEscalation, gateDecision, existingLabels);

    const result = this.buildResult({
      issue: issueResult,
      actions: validatedActions,
      trustResult,
      isAllowlisted: firewall.value.isAllowlisted,
      auditSink: firewall.value.auditSink,
      reputation,
      gateDecision,
      safeContent: { title: safeTitle, body: safeBody },
      startTime,
    });

    logger.info('Issue triage completed', {
      issueNumber,
      category: result.category,
      actionCount: result.proposedActions.length,
      durationMs: result.totalDurationMs,
    });

    return ok(result);
  }

  /**
   * Sanitizes untrusted issue content before processing.
   * (Source: Issue #828 — input-sanitizer wiring)
   */
  private sanitizeContent(text: string, author: string): string {
    if (text.length === 0) return text;
    const result = sanitizeInput(text, 'unknown', author);
    if (result.wasModified) {
      logger.warn('Issue content sanitized', {
        author,
        strippedCount: result.strippedElements.length,
        injectionFlags: result.injectionFlags,
      });
    }
    return result.content;
  }

  /**
   * Classifies the issue author's trust tier through the shared firewall
   * (#4992; originally Issue #828 — trust-classifier wiring).
   *
   * The access posture is passed per call so the firewall's Rule-of-Two check
   * sees the same facts `validateActions` enforces on. No maintainer allowlist
   * is passed: there is no source for one today (no config field, no env var),
   * so none is consulted and `isAllowlisted` stays absent on the result rather
   * than being recorded as `false`.
   */
  private classifyAuthor(
    issue: IssueMetadata,
    reputation: ReputationAssessment | undefined
  ): Result<FirewallResult, Error> {
    return runUntrustedInputFirewall(
      {
        type: 'issue',
        username: issue.author,
        authorAssociation: issue.authorAssociation,
        title: issue.title,
        body: issue.body,
      },
      { context: this.accessContext(), reputation: { assessment: reputation } }
    );
  }

  /**
   * The access posture this triage runs under — the two Rule-of-Two conjuncts
   * that are about the agent rather than the input. Shared by the firewall
   * (#4992) and `validateActions` so the two cannot disagree.
   */
  private accessContext(): { hasWriteAccess: boolean; hasSecretAccess: boolean } {
    return {
      hasWriteAccess: !this.config.dryRun,
      // #4681: read the token from where it ACTUALLY comes from. The previous
      // form (`this.config.githubToken !== undefined`) was written to make this
      // conjunct "real", but no production caller ever sets `githubToken` — the
      // SCM provider resolves the live credential from GITHUB_TOKEN/GH_TOKEN.
      // So the conjunct was permanently false and Rule of Two could never trip,
      // which is precisely the constant it was introduced to remove.
      // `hasToken()` is the canonical resolver-backed check.
      hasSecretAccess: this.config.githubToken !== undefined || hasToken('github'),
    };
  }

  /**
   * Assesses the issue author's reputation using the reputation model.
   * This is one of the two NEW security module wirings completing #828.
   * (Source: Issue #828 — reputation-model wiring)
   */
  private assessAuthorReputation(data: {
    issue: IssueMetadata;
    comments: readonly IssueComment[];
    commentsAvailable: boolean;
    accountAgeDays?: number;
  }): ReputationAssessment | undefined {
    if (!this.config.enableReputation) return undefined;
    const { issue, comments, commentsAvailable, accountAgeDays } = data;

    // #4681: scan BOTH the title and the body. Scanning only the body left a
    // real bypass: an injection payload is plain text, so content-sanitization
    // does not strip it from the title, and its flags were discarded here — the
    // identical payload was refused at Tier 4 in the body but raised no signal
    // at all in the title, then reached the emitted SummarizeIssue verbatim.
    const bodyScan = sanitizeInput(issue.body, 'unknown', issue.author);
    const titleScan = sanitizeInput(issue.title, 'unknown', issue.author);
    const injectionFlags = [...new Set([...titleScan.injectionFlags, ...bodyScan.injectionFlags])];

    // #3121: accountAgeDays is the author's REAL account age (fetched in
    // fetchIssueData) or undefined when the lookup failed. When undefined it is
    // OMITTED so the engine skips the new_account signal (#3106) — never
    // fabricated. priorContributions/recentCommentCount use real comment data.
    const metadata: GitHubUserMetadata = {
      username: issue.author,
      ...(accountAgeDays !== undefined ? { accountAgeDays } : {}),
      ...(commentsAvailable
        ? {
            priorContributions: countAuthorComments(issue.author, comments),
            recentCommentCount: countRecentComments(issue.author, comments),
            recentCommentWindowMinutes: 10,
          }
        : {}),
      authorAssociation: issue.authorAssociation,
      injectionFlags,
    };

    return assessReputation(metadata, commentsAvailable ? this.reputationCache : undefined);
  }

  /**
   * Generates typed agent actions based on issue analysis.
   */
  private generateActions(
    safeTitle: string,
    safeBody: string,
    issue: IssueMetadata,
    trustResult: ClassifyResult
  ): AgentAction[] {
    const actions: AgentAction[] = [];
    const source = this.createIssueSource(issue, trustResult.trustTier);

    // Always generate ClassifyIssue action
    const [category, confidence] = categorizeIssue(safeTitle, safeBody);
    actions.push({
      type: 'ClassifyIssue',
      category,
      confidence,
      sources: [source],
    });

    // Generate ProposeLabels if we found label hints
    const labels = extractLabelsFromBody(safeTitle, safeBody);
    if (labels.length > 0) {
      actions.push({
        type: 'ProposeLabels',
        labels,
        reason: `Keyword-based label extraction from issue #${String(issue.number)}`,
        sources: [source],
      });
    }

    // Generate SummarizeIssue for semi-trusted+ authors
    if (trustResult.trustTier === '1' || trustResult.trustTier === '2') {
      const summary = `Issue #${String(issue.number)} "${safeTitle}" by ${issue.author} (${trustResult.userRole})`;
      actions.push({
        type: 'SummarizeIssue',
        summary: summary.length >= 10 ? summary : `${summary} — awaiting further analysis`,
        sources: [source],
      });
    }

    return actions;
  }

  /**
   * Validates all actions through policy gate and corroboration validator.
   * This completes the #828 wiring by integrating corroboration-validator.
   * (Source: Issue #828 — policy-gate + corroboration-validator wiring)
   */
  private validateActions(
    actions: readonly AgentAction[],
    gateDecision: ReputationGateDecision,
    existingLabels: ReadonlySet<string> | undefined
  ): ProposedAction[] {
    // #3119 + #3122: reputation GATES via the rollout mode. `enforce` uses the
    // reconciled (possibly demoted) tier; `audit`/`off` enforce the classifier
    // tier (the suppressed demotion is logged upstream). Demotion-only;
    // Tier-1/allowlist always wins.
    const context: ActionContext = {
      inputTrustTier: gateDecision.enforcedTier,
      ...this.accessContext(),
      ...(existingLabels !== undefined ? { existingLabels } : {}),
    };

    return actions.map((action) => {
      const policyDecision = evaluatePolicy(action, context);
      const corrobResult = validateCorroboration(action);

      return {
        type: action.type,
        description: describeAction(action),
        policyApproved: policyDecision.allowed,
        corroborated: corrobResult.satisfied,
        details: buildActionDetails(action, policyDecision, corrobResult),
      };
    });
  }

  /**
   * Builds the final triage result.
   */
  private buildResult(opts: {
    issue: IssueMetadata;
    actions: readonly ProposedAction[];
    trustResult: ClassifyResult;
    /** Present only when the firewall consulted an allowlist (#4992). */
    isAllowlisted: boolean | undefined;
    auditSink: FirewallResult['auditSink'];
    reputation: ReputationAssessment | undefined;
    gateDecision: ReputationGateDecision;
    safeContent: { title: string; body: string };
    startTime: number;
  }): IssueTriageResult {
    const {
      issue,
      actions,
      trustResult,
      isAllowlisted,
      auditSink,
      reputation,
      gateDecision,
      safeContent,
      startTime,
    } = opts;
    const [category, confidence] = categorizeIssue(safeContent.title, safeContent.body);

    // Tier 1 actors (owner/maintainer) cannot be suspicious — reconcile
    // the trust-classifier result with the reputation-model result.
    const isTier1 = trustResult.trustTier === '1';

    const trustAssessment: TrustAssessment = {
      trustTier: trustResult.trustTier,
      userRole: trustResult.userRole,
      // Measured or absent (#4992): never the classifier's default `false`.
      ...(isAllowlisted !== undefined ? { isAllowlisted } : {}),
      auditSink,
      reputationScore: reputation?.reputationScore,
      coverage: reputation?.coverage,
      suspiciousSignals: isTier1 ? [] : (reputation?.suspiciousSignals ?? []),
      isSuspicious: isTier1 ? false : (reputation?.isSuspicious ?? false),
      // #3122: surface both the enforced tier (what the gate used) and the
      // reconciled tier (what reputation computed) so telemetry can't mistake
      // a would-be demotion for an enforced one.
      enforcedTrustTier: gateDecision.enforcedTier,
      reputationReconciledTier: gateDecision.reconciledTier,
      gatingMode: gateDecision.mode,
    };

    return {
      issueNumber: issue.number,
      repository: `${issue.owner}/${issue.repo}`,
      proposedActions: actions,
      trustAssessment,
      category,
      categoryConfidence: confidence,
      totalDurationMs: getTimeProvider().now() - startTime,
      timestamp: getTimeProvider().nowIso(),
    };
  }

  /**
   * Creates a repo file source citation for the triage.
   */
  private createIssueSource(issue: IssueMetadata, trustTier: TrustTier): SourceCitation {
    return {
      type: 'issueBody',
      issueNumber: issue.number,
      author: issue.author,
      authorTrustTier: trustTier,
    };
  }

  /**
   * Fetches issue data from the SCM provider and maps to dogfooding types.
   */
  private async fetchIssueData(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<
    Result<
      {
        issue: IssueMetadata;
        comments: IssueComment[];
        commentsAvailable: boolean;
        accountAgeDays?: number;
        existingLabels?: ReadonlySet<string>;
      },
      Error
    >
  > {
    const provider = createFullGitHubProvider(`${owner}/${repo}`);

    const detailResult = await provider.getIssueDetail(issueNumber);
    if (!detailResult.ok) return err(detailResult.error);

    const detail = detailResult.value;
    const issue: IssueMetadata = { ...detail, owner, repo };

    const commentsResult = await provider.listCommentDetails(issueNumber);
    if (!commentsResult.ok) {
      logger.warn('Failed to fetch issue comments; activity reputation is unmeasured', {
        issueNumber,
        error: commentsResult.error.message,
      });
    }
    const comments = commentsResult.ok ? mapIssueComments(commentsResult.value) : [];
    const commentsAvailable = commentsResult.ok;

    const labelsResult = await provider.listRepositoryLabels();
    if (!labelsResult.ok) {
      logger.warn('Failed to fetch repository labels; label validity is unmeasured', {
        issueNumber,
        error: labelsResult.error.message,
      });
    }

    // #3121: fetch the author's REAL account age (their account creation date,
    // not the issue date). Best-effort — on failure or an unparseable date we
    // omit it, so the reputation engine SKIPS the new_account signal (#3106)
    // rather than fabricating a value. Reputation must not block on this.
    const accountAgeDays = await this.fetchAccountAgeDays(provider, detail.author);

    return ok({
      issue,
      comments,
      commentsAvailable,
      ...(accountAgeDays !== undefined ? { accountAgeDays } : {}),
      ...(labelsResult.ok ? { existingLabels: new Set(labelsResult.value) } : {}),
    });
  }

  /**
   * Best-effort lookup of a GitHub user's account age in days. Returns
   * `undefined` if the user-metadata fetch fails or the creation date can't be
   * parsed (#3121) — callers must treat absence as "unknown", not "benign".
   */
  private async fetchAccountAgeDays(
    provider: { fetchUserMetadata: (u: string) => Promise<Result<ScmUserMetadata, Error>> },
    username: string
  ): Promise<number | undefined> {
    try {
      const result = await provider.fetchUserMetadata(username);
      if (!result.ok) return undefined;
      const createdMs = Date.parse(result.value.createdAt);
      if (!Number.isFinite(createdMs)) return undefined;
      return Math.floor((getTimeProvider().now() - createdMs) / 86_400_000);
    } catch {
      // Truly best-effort: even an unexpected rejection (token resolution,
      // transport) must not break triage — fall back to "unknown" age.
      return undefined;
    }
  }
}

/** Counts how many comments the author has made on the issue. */
function countAuthorComments(author: string, comments: readonly IssueComment[]): number {
  return comments.filter((comment) => comment.author === author).length;
}

/** Counts recent comments from the author (within 10 minutes). */
function countRecentComments(author: string, comments: readonly IssueComment[]): number {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  return comments.filter(
    (comment) => comment.author === author && new Date(comment.createdAt).getTime() > tenMinutesAgo
  ).length;
}

/**
 * Creates an IssueTriage instance.
 */
export function createIssueTriage(config?: Partial<IssueTriageConfig>): IssueTriage {
  return new IssueTriage(config);
}
