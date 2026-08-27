/**
 * Access Constraint Deriver — Type definitions (#1977).
 *
 * Task-objective-derived tool access policies enforced at the tool-call
 * boundary. See arxiv-2604.11790 (ClawGuard). Design doc: issue #1977.
 *
 * @module security/access-constraint-deriver/types
 */

import { z } from 'zod';

/**
 * Operating modes for the access-constraint-deriver pipeline.
 *
 * - `off`: bypass entirely; no policy enforcement, no audit logging
 * - `audit` (default in v2.50+): log every violation, block nothing — collects
 *   telemetry to size the violation rate before flipping to enforce
 * - `confirm_risky` (#2279): graduated middle tier. Block violations on tools
 *   classified as risky (write/exec/network); log-and-allow violations on
 *   read-only tools. The intent is "block the calls a human would want to
 *   review; let the safe reads through" — graduation path between audit and
 *   enforce that doesn't break read-heavy workflows
 * - `enforce`: block every violation, regardless of risk classification
 */
export const AccessPolicyModeSchema = z.enum(['off', 'audit', 'confirm_risky', 'enforce']);
export type AccessPolicyMode = z.infer<typeof AccessPolicyModeSchema>;

/** Source of the derived policy. */
export const AccessPolicySourceSchema = z.enum(['llm', 'fallback-keyword', 'bypass']);
export type AccessPolicySource = z.infer<typeof AccessPolicySourceSchema>;

/** Categories of operations a task may perform. */
export const AccessOperationSchema = z.enum(['read', 'write', 'execute', 'network']);
export type AccessOperation = z.infer<typeof AccessOperationSchema>;

/**
 * Task access policy derived from the user objective at task start.
 *
 * A policy restricts which tools, paths, and operations the agent may invoke
 * during execution. `allowedTools: '*'` and `allowedOperations: '*'` represent
 * an unrestricted policy (used in `off` mode or when derivation is bypassed).
 */
export const TaskAccessPolicySchema = z.object({
  allowedTools: z.union([z.array(z.string()).readonly(), z.literal('*')]),
  allowedPathPatterns: z.array(z.string()).readonly(),
  allowedOperations: z.union([z.array(AccessOperationSchema).readonly(), z.literal('*')]),
  objectiveHash: z.string(),
  derivedAt: z.string(),
  source: AccessPolicySourceSchema,
  mode: AccessPolicyModeSchema,
});
export type TaskAccessPolicy = z.infer<typeof TaskAccessPolicySchema>;

/**
 * Result of checking a proposed tool call against a policy.
 *
 * `unmeasured` is distinct from `allow` and from `log-and-allow` on purpose
 * (#5022). It means the allowlist arm of the check could not run at all —
 * not that the call was examined and passed, and not that it violated a
 * policy. Collapsing it into either of the others is what produced the
 * original defect: an empty `allowedTools` was read as "nothing is
 * permitted", so the verdict became a constant that carried no information
 * about the call. A consumer MUST NOT record an `unmeasured` outcome as a
 * violation — doing so gives the #2077 enforce-flip denominator a 100%
 * violation rate that says nothing about precision.
 */
export type AccessDecision =
  | { readonly decision: 'allow' }
  | { readonly decision: 'deny'; readonly reason: string; readonly matchedRule: string }
  | { readonly decision: 'log-and-allow'; readonly warning: string }
  | { readonly decision: 'unmeasured'; readonly reason: string };
