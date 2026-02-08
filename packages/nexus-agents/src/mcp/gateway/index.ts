/**
 * MCP Gateway — Tiered orchestration routing
 *
 * @module mcp/gateway
 * (Source: Epic #888)
 */

export {
  classifyRequestTier,
  RequestTier,
  TOOL_TIER_MAP,
  type TierOverrides,
} from './tier-classifier.js';

export {
  createGateway,
  type GatewayConfig,
  type GatewayInstance,
  type GatewayToolHandler,
  type GatewayToolResult,
  type GatewayLogEntry,
} from './gateway-middleware.js';

export {
  classifyWithGovernance,
  auditGovernancePromotion,
  type GovernanceClassification,
  type GovernanceDomain,
  type VotingThreshold,
} from './governance-enforcer.js';

export {
  generateTierRecommendations,
  type TierRecommendation,
  type TierRecommenderConfig,
  type TierDirection,
} from './tier-recommender.js';

export { createGatewayServerProxy } from './gateway-server-proxy.js';
