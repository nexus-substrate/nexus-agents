/**
 * nexus-agents/agents - Expert Base Types
 *
 * Base type definitions for expert agents.
 * Extracted to break circular dependency between expert-types and expert-documentation-types.
 *
 * @module agents/experts/expert-base-types
 * (Source: Issue #392 - Circular dependency resolution)
 */

import type { AgentCapability } from '../../core/index.js';

/**
 * Expert-specific configuration options.
 */
export interface ExpertOptions {
  /** Custom system prompt override */
  systemPromptOverride?: string;
  /** Temperature for completions (domain-specific default if not set) */
  temperature?: number;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Enable domain-specific heuristics */
  enableHeuristics?: boolean;
  /** Custom capability extensions */
  additionalCapabilities?: AgentCapability[];
}

/**
 * Output format for expert task results.
 */
export interface ExpertOutput {
  /** Primary result content */
  content: string;
  /** Structured data if applicable */
  structuredData?: Record<string, unknown> | undefined;
  /** Recommendations or suggestions */
  recommendations?: string[] | undefined;
  /** Warnings or issues found */
  warnings?: string[] | undefined;
  /** Confidence score (0-1) */
  confidence: number;
  /** Model used for this expert's execution (Issue #817) */
  modelUsed?: string | undefined;
}
