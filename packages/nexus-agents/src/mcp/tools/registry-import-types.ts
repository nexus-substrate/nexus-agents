/**
 * nexus-agents/mcp - Registry Import Types
 *
 * Input/output types for the registry_import MCP tool.
 *
 * @module mcp/tools/registry-import-types
 * (Source: Issue #889, Epic #888)
 */

import { z } from 'zod';
import type { ModelCapability } from '../../config/model-capabilities-types.js';

// ============================================================================
// Input Schema
// ============================================================================

export const RegistryImportInputSchema = z.object({
  /** Model provider. */
  provider: z
    .enum(['anthropic', 'google', 'openai'])
    .describe('Model provider (anthropic, google, openai)'),
  /** Model identifier from the provider (e.g., "claude-4-opus-20260201"). */
  modelId: z.string().min(1).describe('Provider model identifier'),
  /** No-op flag echoed back in the response; the tool never persists regardless. */
  dryRun: z
    .boolean()
    .optional()
    .default(true)
    .describe('No-op flag echoed back in the response; the tool never persists regardless'),
});

export type RegistryImportInput = z.infer<typeof RegistryImportInputSchema>;

// ============================================================================
// Output Types
// ============================================================================

/** Generated registry entry with review metadata. */
export interface RegistryImportResponse {
  /** Whether this was a dry run (preview only). */
  readonly dryRun: boolean;
  /** The generated ModelCapability entry. */
  readonly entry: ModelCapability;
  /** Whether the entry was persisted to the registry. */
  readonly persisted: boolean;
  /** Human-readable warnings about unvalidated fields. */
  readonly warnings: readonly string[];
}
