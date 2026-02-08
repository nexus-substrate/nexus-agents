/**
 * Request Tier Classifier
 *
 * Pure function that classifies incoming MCP tool requests into tiers
 * for the orchestration gateway. No side effects, no I/O.
 *
 * Tier 1 (DIRECT):       Read-only tools — direct dispatch + logging
 * Tier 2 (ANALYZED):     Model-selection tools — task analysis first
 * Tier 3 (ORCHESTRATED): Complex/risky tools — full orchestration pipeline
 *
 * Security and architecture-related requests are always promoted to Tier 3.
 *
 * @module mcp/gateway/tier-classifier
 * (Source: Issue #892, Epic #888)
 */

import { SECURITY_KEYWORDS, ARCHITECTURE_KEYWORDS, PROMOTED_ROLES } from './gateway-keywords.js';

/** Request processing tier. Higher = more orchestration overhead. */
export enum RequestTier {
  /** Direct dispatch with structured logging. */
  DIRECT = 1,
  /** Task analysis + model selection via delegate_to_model. */
  ANALYZED = 2,
  /** Full orchestration + decomposition + voting. */
  ORCHESTRATED = 3,
}

/** Per-tool tier override map (from nexus-agents.yaml). */
export type TierOverrides = Record<string, RequestTier>;

/**
 * Default tier assignment for all 20 registered MCP tools.
 * Tier 1: read-only, no model invocation needed.
 * Tier 2: requires model selection or expert creation.
 * Tier 3: requires full orchestration, decomposition, or consensus.
 */
export const TOOL_TIER_MAP: Readonly<Record<string, RequestTier>> = {
  // Tier 1 — Read-only
  list_experts: RequestTier.DIRECT,
  list_workflows: RequestTier.DIRECT,
  memory_query: RequestTier.DIRECT,
  memory_stats: RequestTier.DIRECT,
  weather_report: RequestTier.DIRECT,
  research_query: RequestTier.DIRECT,
  research_analyze: RequestTier.DIRECT,
  research_catalog_review: RequestTier.DIRECT,

  // Tier 2 — Model selection
  delegate_to_model: RequestTier.ANALYZED,
  create_expert: RequestTier.ANALYZED,
  execute_expert: RequestTier.ANALYZED,
  research_add: RequestTier.ANALYZED,
  research_discover: RequestTier.ANALYZED,
  registry_import: RequestTier.ANALYZED,

  // Tier 3 — Full orchestration
  orchestrate: RequestTier.ORCHESTRATED,
  consensus_vote: RequestTier.ORCHESTRATED,
  execute_spec: RequestTier.ORCHESTRATED,
  run_workflow: RequestTier.ORCHESTRATED,
  run_graph_workflow: RequestTier.ORCHESTRATED,
  issue_triage: RequestTier.ORCHESTRATED,
};

/**
 * Classifies an MCP tool request into a processing tier.
 *
 * @param toolName - The MCP tool being invoked
 * @param params - The tool's input parameters
 * @param overrides - Optional per-tool tier overrides
 * @returns The appropriate RequestTier for this request
 */
export function classifyRequestTier(
  toolName: string,
  params: Record<string, unknown>,
  overrides?: TierOverrides
): RequestTier {
  const defaultTier = TOOL_TIER_MAP[toolName] ?? RequestTier.ANALYZED;
  const effectiveTier = overrides?.[toolName] ?? defaultTier;

  // Tier 1 tools (from canonical map, not overridden) skip promotion checks
  if (defaultTier === RequestTier.DIRECT && effectiveTier === RequestTier.DIRECT) {
    return RequestTier.DIRECT;
  }

  // Security/architecture promotion always wins — overrides cannot suppress it
  if (effectiveTier < RequestTier.ORCHESTRATED && shouldPromote(params)) {
    return RequestTier.ORCHESTRATED;
  }

  return effectiveTier;
}

/**
 * Checks if request params contain security or architecture keywords
 * that warrant promotion to Tier 3.
 */
function shouldPromote(params: Record<string, unknown>): boolean {
  // Check role-based promotion
  const role = params['role'];
  if (typeof role === 'string' && PROMOTED_ROLES.has(role)) {
    return true;
  }

  // Check text content for keyword matches
  const textFields = ['task', 'proposal', 'prompt'];
  for (const field of textFields) {
    const value = params[field];
    if (typeof value === 'string' && containsPromotionKeyword(value)) {
      return true;
    }
  }

  return false;
}

/** Map from config string tier names to RequestTier enum values. */
const TIER_NAME_TO_ENUM: Readonly<Record<string, RequestTier>> = {
  DIRECT: RequestTier.DIRECT,
  ANALYZED: RequestTier.ANALYZED,
  ORCHESTRATED: RequestTier.ORCHESTRATED,
};

/**
 * Converts string tier override map (from config schema) to RequestTier enum map.
 * Ignores entries with invalid tier names.
 *
 * @param overrides - String-keyed tier names from GatewayConfigSchema
 * @returns Enum-valued TierOverrides, or undefined if empty/undefined
 */
export function parseTierOverrides(
  overrides: Record<string, string> | undefined
): TierOverrides | undefined {
  if (overrides === undefined) return undefined;
  const result: TierOverrides = {};
  for (const [tool, tierName] of Object.entries(overrides)) {
    const tier = TIER_NAME_TO_ENUM[tierName];
    if (tier !== undefined) {
      result[tool] = tier;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Checks if text contains any security or architecture promotion keyword. */
function containsPromotionKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  for (const kw of SECURITY_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  for (const kw of ARCHITECTURE_KEYWORDS) {
    if (new RegExp(kw, 'i').test(text)) return true;
  }
  return false;
}
