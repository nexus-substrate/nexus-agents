/**
 * nexus-agents/cli-adapters - Claude CLI Response Parser
 *
 * Defensive parser for Claude CLI JSON output.
 * Handles version 2.0.x output format.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { ICliResponseParser, TokenUsage } from '../types.js';

/**
 * Claude CLI response structure.
 * (Source: CLI testing 2026-01-04)
 */
export interface ClaudeCliResponse {
  readonly type: 'result';
  readonly subtype?: 'success' | 'error';
  readonly is_error: boolean;
  readonly duration_ms?: number;
  readonly result: string;
  readonly session_id?: string;
  readonly total_cost_usd?: number;
  readonly usage?: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cache_creation_input_tokens?: number;
    readonly cache_read_input_tokens?: number;
  };
  readonly modelUsage?: Record<
    string,
    {
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly cacheReadInputTokens?: number;
      readonly cacheCreationInputTokens?: number;
      readonly costUSD?: number;
      readonly contextWindow?: number;
    }
  >;
}

/**
 * Parser for Claude CLI JSON output.
 * Implements defensive parsing - only requires essential fields.
 */
export class ClaudeResponseParser implements ICliResponseParser<ClaudeCliResponse> {
  readonly name = 'claude-parser';
  readonly supportedVersionRange = '>=2.0.0 <3.0.0';

  /**
   * Parses complete Claude CLI response.
   */
  parse(raw: string): ClaudeCliResponse | null {
    try {
      const data: unknown = JSON.parse(raw);

      if (!this.isValidResponse(data)) {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  /**
   * Extracts just the response text (most stable field).
   */
  extractResponse(raw: string): string | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = this.asRecord(data);
      if (record === null) return null;

      const result = record.result;
      if (typeof result === 'string') {
        return result;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extracts token usage from response.
   */
  extractUsage(raw: string): TokenUsage | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = this.asRecord(data);
      if (record === null) return null;

      const usageRecord = this.asRecord(record.usage);
      if (usageRecord === null) return null;

      const inputTokens = this.getNumber(usageRecord, 'input_tokens');
      const outputTokens = this.getNumber(usageRecord, 'output_tokens');

      if (inputTokens === null || outputTokens === null) {
        return null;
      }

      const cachedInputTokens = this.getNumber(usageRecord, 'cache_read_input_tokens');

      return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        ...(cachedInputTokens !== null && { cachedInputTokens }),
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts session ID for resumption.
   */
  extractSessionId(raw: string): string | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = this.asRecord(data);
      if (record === null) return null;

      const sessionId = record.session_id;
      if (typeof sessionId === 'string') {
        return sessionId;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Type guard for valid response structure.
   */
  private isValidResponse(data: unknown): data is ClaudeCliResponse {
    const record = this.asRecord(data);
    if (record === null) return false;

    // Only require the essential field
    return typeof record.result === 'string';
  }

  /**
   * Safely converts unknown to record.
   */
  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  /**
   * Safely extracts a number from an object.
   */
  private getNumber(obj: Record<string, unknown>, key: string): number | null {
    const value = obj[key];
    return typeof value === 'number' ? value : null;
  }
}
