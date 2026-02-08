/**
 * Gateway Middleware for MCP Tool Dispatch
 *
 * Intercepts MCP tool requests, classifies them via the tier classifier,
 * and wraps execution with tier-appropriate structured logging.
 *
 * Tier 1 (DIRECT):       Pass-through with structured log entry
 * Tier 2 (ANALYZED):     Log tier + analysis metadata
 * Tier 3 (ORCHESTRATED): Log tier + orchestration metadata
 *
 * @module mcp/gateway/gateway-middleware
 * (Source: Issue #893, Epic #888)
 */

import type { ILogger } from '../../core/index.js';
import { createLogger, getTimeProvider } from '../../core/index.js';
import { classifyRequestTier, RequestTier, type TierOverrides } from './tier-classifier.js';

/** Tool handler function (matches middleware-chain ToolHandler). */
export type GatewayToolHandler = (args: unknown) => Promise<GatewayToolResult>;

/** Tool result (structurally compatible with MCP SDK CallToolResult). */
export interface GatewayToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Structured log entry emitted for every gateway-wrapped tool invocation. */
export interface GatewayLogEntry {
  tool: string;
  tier: RequestTier;
  tierName: string;
  durationMs: number;
  success: boolean;
}

/** Configuration for the gateway middleware. */
export interface GatewayConfig {
  /** Optional logger instance. */
  readonly logger?: ILogger | undefined;
  /** Per-tool tier overrides from config. */
  readonly tierOverrides?: TierOverrides | undefined;
  /** Whether the gateway is enabled (default: true). */
  readonly enabled?: boolean | undefined;
}

/** Human-readable tier labels. */
const TIER_NAMES: Record<RequestTier, string> = {
  [RequestTier.DIRECT]: 'DIRECT',
  [RequestTier.ANALYZED]: 'ANALYZED',
  [RequestTier.ORCHESTRATED]: 'ORCHESTRATED',
};

/**
 * Creates a gateway middleware that wraps tool handlers with tier-aware
 * structured logging.
 *
 * When disabled, returns the original handler unchanged (zero overhead).
 *
 * @param config - Gateway configuration
 * @returns A `wrapTool` function that enhances tool handlers
 */
export function createGateway(config: GatewayConfig = {}): GatewayInstance {
  const enabled = config.enabled !== false;
  const logger = config.logger ?? createLogger({ component: 'gateway' });
  const overrides = config.tierOverrides;

  return {
    enabled,
    wrapTool(toolName: string, handler: GatewayToolHandler): GatewayToolHandler {
      if (!enabled) return handler;
      return createGatewayHandler(toolName, handler, logger, overrides);
    },
  };
}

/** Gateway instance returned by createGateway. */
export interface GatewayInstance {
  /** Whether the gateway is active. */
  readonly enabled: boolean;
  /** Wraps a tool handler with tier-aware dispatch. */
  wrapTool(toolName: string, handler: GatewayToolHandler): GatewayToolHandler;
}

/** Creates a tier-aware handler wrapper for a single tool. */
function createGatewayHandler(
  toolName: string,
  handler: GatewayToolHandler,
  logger: ILogger,
  overrides?: TierOverrides
): GatewayToolHandler {
  return async (args: unknown): Promise<GatewayToolResult> => {
    const params = asRecord(args);
    const tier = classifyRequestTier(toolName, params, overrides);
    const tierName = TIER_NAMES[tier];
    const startMs = getTimeProvider().now();

    logger.debug('Gateway dispatch', { tool: toolName, tier, tierName });

    try {
      const result = await handler(args);
      const durationMs = getTimeProvider().now() - startMs;
      const success = result.isError !== true;

      const entry: GatewayLogEntry = { tool: toolName, tier, tierName, durationMs, success };
      if (success) {
        logger.info('Gateway completed', { ...entry });
      } else {
        logger.warn('Gateway completed with error', { ...entry });
      }

      return result;
    } catch (error) {
      const durationMs = getTimeProvider().now() - startMs;
      const entry: GatewayLogEntry = {
        tool: toolName,
        tier,
        tierName,
        durationMs,
        success: false,
      };
      logger.error('Gateway handler threw', error instanceof Error ? error : undefined, {
        ...entry,
      });
      throw error;
    }
  };
}

/** Safely coerces args to Record for tier classification. */
function asRecord(args: unknown): Record<string, unknown> {
  if (args !== null && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}
