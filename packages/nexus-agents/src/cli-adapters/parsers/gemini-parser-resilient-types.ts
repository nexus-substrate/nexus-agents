/**
 * nexus-agents/cli-adapters - Resilient Gemini Parser Types
 *
 * Type definitions for the resilient Gemini CLI response parser.
 *
 * (Source: Issue #366 - Gemini CLI timeout and parser improvements)
 */

import type { TokenUsage } from '../types.js';

/** Parse result with metadata about which strategy succeeded. */
export interface ResilientParseResult {
  readonly response: string;
  readonly sessionId?: string;
  readonly usage?: TokenUsage;
  readonly parseStrategy: ParseStrategy;
  readonly raw: string;
}

/** Parsing strategy that succeeded. */
export type ParseStrategy =
  | 'json'
  | 'json-extracted'
  | 'markdown-code-block'
  | 'plain-text'
  | 'error-fallback';

/** Error information extracted from Gemini CLI output. */
export interface GeminiErrorInfo {
  readonly type: 'timeout' | 'auth' | 'rate-limit' | 'api-error' | 'unknown';
  readonly message: string;
  readonly code?: number;
}

/** Token totals aggregated from model stats. */
export interface TokenTotals {
  readonly input: number;
  readonly output: number;
  readonly cached: number;
}
