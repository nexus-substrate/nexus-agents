/**
 * nexus-agents/config - Gateway Configuration Schema
 *
 * Schema for the MCP gateway middleware configuration.
 * Controls tier-aware dispatch logging, per-tool tier overrides,
 * and upstream MCP server composition (#1498).
 *
 * (Source: Issue #897, Epic #888, Issue #1498)
 */

import { z } from 'zod';

/**
 * Valid tier names for configuration.
 * Maps to RequestTier enum values in tier-classifier.ts.
 */
const TierNameSchema = z.enum(['DIRECT', 'ANALYZED', 'ORCHESTRATED']);

/** Allowed commands for upstream MCP servers (security: no arbitrary exec). */
const ALLOWED_COMMANDS = ['node', 'npx', 'python', 'python3', 'uvx', 'docker'] as const;

/**
 * Upstream MCP server configuration (#1498).
 * Defines an external MCP server to connect to via stdio transport.
 */
export const UpstreamServerSchema = z.object({
  /** Unique name for this upstream server (used as tool prefix). */
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_-]+$/),
  /** Command to spawn the server. Must be in allowlist. */
  command: z.enum(ALLOWED_COMMANDS),
  /** Arguments to pass to the command. */
  args: z.array(z.string().max(500)).default([]),
  /** Environment variables (use {env:VAR} references, not plaintext secrets). */
  env: z.record(z.string(), z.string()).optional(),
  /** Whether to connect lazily on first tool call (default: true). */
  lazy: z.boolean().default(true),
  /** Connection timeout in ms (default: 10000). */
  timeoutMs: z.number().int().min(1000).max(60000).default(10000),
});

export type UpstreamServerConfig = z.infer<typeof UpstreamServerSchema>;

/** Maximum number of upstream servers (resource limit). */
export const MAX_UPSTREAM_SERVERS = 5;

/**
 * Gateway middleware configuration schema.
 *
 * Controls whether tier-aware dispatch logging is active,
 * allows per-tool tier overrides, and defines upstream MCP servers.
 */
export const GatewayConfigSchema = z.object({
  /** Enable gateway tier dispatch logging (default: true). */
  enabled: z.boolean().default(true),
  /**
   * Per-tool tier overrides.
   * Keys are tool names (e.g., 'delegate_to_model'), values are tier names.
   * Overrides the default tier from TOOL_TIER_MAP in tier-classifier.ts.
   */
  tierOverrides: z.record(z.string(), TierNameSchema).optional(),
  /**
   * Upstream MCP servers to compose with (#1498).
   * Tools from upstream servers are available as prefixed tools (e.g., tavily.search).
   */
  upstreamServers: z.array(UpstreamServerSchema).max(MAX_UPSTREAM_SERVERS).optional(),
});

export type GatewayConfigType = z.infer<typeof GatewayConfigSchema>;
