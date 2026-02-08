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
