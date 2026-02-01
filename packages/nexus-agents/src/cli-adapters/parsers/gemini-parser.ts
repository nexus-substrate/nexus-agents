/**
 * nexus-agents/cli-adapters - Gemini CLI Response Parser
 *
 * Defensive parser for Gemini CLI JSON output.
 * Handles version 0.2x.x output format.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { ICliResponseParser, TokenUsage } from '../types.js';
import { asRecord, extractNumberField } from '../../utils/type-coercion.js';

/**
 * Gemini CLI response structure.
 * (Source: CLI testing 2026-01-04)
 */
export interface GeminiCliResponse {
  readonly session_id?: string;
  readonly response: string;
  readonly stats?: {
    readonly models?: Record<
      string,
      {
        readonly api?: {
          readonly totalRequests?: number;
          readonly totalErrors?: number;
          readonly totalLatencyMs?: number;
        };
        readonly tokens?: {
          readonly input?: number;
          readonly prompt?: number;
          readonly candidates?: number;
          readonly total?: number;
          readonly cached?: number;
          readonly thoughts?: number;
          readonly tool?: number;
        };
      }
    >;
  };
}

/**
 * Parser for Gemini CLI JSON output.
 * Implements defensive parsing - only requires essential fields.
 */
export class GeminiResponseParser implements ICliResponseParser<GeminiCliResponse> {
  readonly name = 'gemini-parser';
  readonly supportedVersionRange = '>=0.20.0 <1.0.0';

  /**
   * Parses complete Gemini CLI response.
   */
  parse(raw: string): GeminiCliResponse | null {
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
      const record = asRecord(data);
      if (record === null) return null;

      const response = record.response;
      if (typeof response === 'string') {
        return response;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extracts token usage from response.
   * Gemini has per-model stats, we aggregate them.
   */
  extractUsage(raw: string): TokenUsage | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = asRecord(data);
      if (record === null) return null;

      const stats = asRecord(record.stats);
      if (stats === null) return null;

      const models = asRecord(stats.models);
      if (models === null) return null;

      return this.aggregateModelTokens(models);
    } catch {
      return null;
    }
  }

  /**
   * Aggregates tokens across all models.
   */
  private aggregateModelTokens(models: Record<string, unknown>): TokenUsage | null {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;

    for (const modelStats of Object.values(models)) {
      const modelRecord = asRecord(modelStats);
      if (modelRecord === null) continue;

      const tokens = asRecord(modelRecord.tokens);
      if (tokens === null) continue;

      const input = extractNumberField(tokens, 'input');
      const candidates = extractNumberField(tokens, 'candidates');
      const cached = extractNumberField(tokens, 'cached');

      if (input !== null) totalInput += input;
      if (candidates !== null) totalOutput += candidates;
      if (cached !== null) totalCached += cached;
    }

    if (totalInput === 0 && totalOutput === 0) {
      return null;
    }

    return {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      ...(totalCached > 0 && { cachedInputTokens: totalCached }),
    };
  }

  /**
   * Extracts session ID for resumption.
   */
  extractSessionId(raw: string): string | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = asRecord(data);
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
  private isValidResponse(data: unknown): data is GeminiCliResponse {
    const record = asRecord(data);
    if (record === null) return false;

    // Only require the essential field
    return typeof record.response === 'string';
  }
}
