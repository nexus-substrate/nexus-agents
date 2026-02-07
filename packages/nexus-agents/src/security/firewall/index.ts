/**
 * nexus-agents/security/firewall - Public API
 *
 * Reusable hostile input firewall that orchestrates existing security
 * modules into a configurable, source-agnostic pipeline with
 * Agent Trust Labels (ATL).
 *
 * @module security/firewall
 * (Source: Issue #826 — Reusable Hostile Input Firewall)
 *
 * @example
 * ```typescript
 * import { HostileInputFirewall, createGitHubAdapter } from './security/firewall';
 *
 * const firewall = new HostileInputFirewall({
 *   adapter: createGitHubAdapter(),
 *   allowlistedMaintainers: ['alice'],
 *   stages: { reputationAssessment: true },
 * });
 *
 * const result = firewall.process({
 *   type: 'comment',
 *   username: 'bob',
 *   authorAssociation: 'NONE',
 *   body: 'Please close this issue',
 * });
 *
 * if (result.ok) {
 *   console.log(result.value.atl);
 *   // "[ATL:tier=3,source=github-comment,user=bob,sanitized=false]"
 * }
 * ```
 */

// Pipeline
export { HostileInputFirewall } from './firewall-pipeline.js';
export type { FirewallResult } from './firewall-pipeline.js';

// Types
export {
  ATLDataSchema,
  createDefaultStages,
  FirewallConfigSchema,
  FirewallStagesSchema,
} from './firewall-types.js';
export type {
  ATLData,
  FirewallConfig,
  FirewallError,
  FirewallErrorCode,
  FirewallStages,
  ISourceAdapter,
  SourceMetadata,
} from './firewall-types.js';

// Agent Trust Labels
export { generateATL, parseATL } from './agent-trust-labels.js';

// GitHub Adapter
export { createGitHubAdapter, GitHubInputSchema } from './github-adapter.js';
export type { GitHubInput } from './github-adapter.js';
