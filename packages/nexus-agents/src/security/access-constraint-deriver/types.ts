/**
 * Access Constraint Deriver — Type definitions (#1977).
 *
 * Task-objective-derived tool access policies enforced at the tool-call
 * boundary. See arxiv-2604.11790 (ClawGuard). Design doc: issue #1977.
 *
 * @module security/access-constraint-deriver/types
 */

import { z } from 'zod';

/** Operating modes for the access-constraint-deriver pipeline. */
export const AccessPolicyModeSchema = z.enum(['off', 'audit', 'enforce']);
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

/** Result of checking a proposed tool call against a policy. */
export type AccessDecision =
  | { readonly decision: 'allow' }
  | { readonly decision: 'deny'; readonly reason: string; readonly matchedRule: string }
  | { readonly decision: 'log-and-allow'; readonly warning: string };
