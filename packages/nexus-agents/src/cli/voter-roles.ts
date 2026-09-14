/**
 * nexus-agents/cli - Voter role configuration
 *
 * Which seats sit on a consensus panel, what each is told to evaluate, and
 * which subset the quick panel runs. Extracted from `cli/vote-types.ts` and
 * `mcp/tools/consensus-vote.ts` (#6000 step 1): a single edit here changes who
 * decides a vote, so the configuration lives apart from the routine result
 * types it used to share a file with. `vote-types.ts` re-exports the role
 * type and descriptions, so the public API is unchanged.
 *
 * @module cli/voter-roles
 */

/**
 * Voter agent role definitions.
 *
 * `scope_steward` (#2185) was added 2026-04-25 to address a build-vs-buy
 * blind spot in the original 6-role panel: the panel approved a proposal
 * to build a USB-flasher CLI without flagging that Rufus already solves
 * the problem. The scope-steward role explicitly checks for existing tools
 * + biases toward "don't build."
 */
export type VoterRole =
  'architect' | 'security' | 'devex' | 'ai_ml' | 'pm' | 'catfish' | 'scope_steward';

/**
 * Agent role descriptions for prompt generation.
 */
export const VOTER_ROLES: Record<VoterRole, string> = {
  architect: 'Software Architect - evaluates technical design, scalability, and maintainability',
  security:
    'Security Engineer - evaluates security implications, vulnerabilities, and attack vectors',
  devex: 'Developer Experience - evaluates usability, documentation, and developer workflow',
  ai_ml: 'AI/ML Engineer - evaluates AI/ML aspects, model selection, and learning capabilities',
  pm: 'Product Manager - evaluates business value, user impact, and resource allocation',
  catfish:
    'Contrarian Analyst - deliberately challenges proposals to prevent agreement bias (arXiv:2505.21503)',
  scope_steward:
    'Scope Steward - asks whether to build at all; checks existing tools, biases toward kill-the-feature (#2185)',
};

/**
 * The seats a `consensus_vote` panel runs, by mode.
 *
 * Moved verbatim from `mcp/tools/consensus-vote.ts` (#6000 step 1): the panel
 * composition decides whether the contrarian is present, which the
 * `absolute_quorum` verdict depends on.
 */
export function getVoterRoles(quickMode: boolean): readonly VoterRole[] {
  // Default panel expanded to 7 roles 2026-04-25 — scope_steward added to
  // catch build-vs-buy blind spots (#2185). QuickMode substitutes
  // scope_steward for pm so fast triage covers existence-justification.
  return quickMode
    ? ['architect', 'security', 'scope_steward']
    : ['architect', 'security', 'devex', 'ai_ml', 'pm', 'catfish', 'scope_steward'];
}
