/**
 * nexus-agents/cli-adapters - Resilient Gemini CLI Response Parser
 *
 * Enhanced parser with multiple fallback strategies for handling
 * various Gemini CLI output formats including:
 * - Standard JSON output
 * - Plain text responses
 * - Multi-line outputs with markdown
 * - Error messages and exit codes
 *
 * (Source: Issue #366 - Gemini CLI timeout and parser improvements)
 */

import type { ICliResponseParser, TokenUsage } from '../types.js';
import type { GeminiCliResponse } from './gemini-parser.js';

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

/**
 * Resilient parser for Gemini CLI output.
 * Implements multiple fallback strategies for robust parsing.
 */
export class ResilientGeminiParser implements ICliResponseParser<GeminiCliResponse> {
  readonly name = 'gemini-resilient-parser';
  readonly supportedVersionRange = '>=0.20.0 <1.0.0';

  /**
   * Parses Gemini CLI output using multiple strategies.
   * Tries JSON first, then falls back to text extraction.
   */
  parse(raw: string): GeminiCliResponse | null {
    const result = this.parseResilient(raw);
    if (result === null) return null;

    // Build the response object, only including optional fields when present
    const response: GeminiCliResponse = {
      response: result.response,
    };

    // Add stats if usage info is available
    if (result.usage !== undefined) {
      return {
        ...response,
        ...(result.sessionId !== undefined && { session_id: result.sessionId }),
        stats: {
          models: {
            'gemini-unknown': {
              tokens: {
                input: result.usage.inputTokens,
                candidates: result.usage.outputTokens,
              },
            },
          },
        },
      };
    }

    // No usage - just add session_id if it exists
    if (result.sessionId !== undefined) {
      return { ...response, session_id: result.sessionId };
    }

    return response;
  }

  /**
   * Parses with full metadata about parsing strategy.
   */
  parseResilient(raw: string): ResilientParseResult | null {
    // Strategy 1: Standard JSON parsing
    const jsonResult = this.tryParseJson(raw);
    if (jsonResult !== null) return jsonResult;

    // Strategy 2: Extract JSON from mixed output
    const extractedJson = this.tryExtractJson(raw);
    if (extractedJson !== null) return extractedJson;

    // Strategy 3: Extract from markdown code blocks
    const markdownResult = this.tryExtractFromMarkdown(raw);
    if (markdownResult !== null) return markdownResult;

    // Strategy 4: Plain text fallback
    const plainTextResult = this.tryPlainText(raw);
    if (plainTextResult !== null) return plainTextResult;

    return null;
  }

  /**
   * Extracts just the response text with fallback strategies.
   */
  extractResponse(raw: string): string | null {
    const result = this.parseResilient(raw);
    return result?.response ?? null;
  }

  /**
   * Extracts token usage if available.
   */
  extractUsage(raw: string): TokenUsage | null {
    // Try JSON parsing first for structured usage data
    const jsonResult = this.tryParseJson(raw);
    if (jsonResult?.usage) return jsonResult.usage;

    const extractedJson = this.tryExtractJson(raw);
    if (extractedJson?.usage) return extractedJson.usage;

    return null;
  }

  /**
   * Extracts session ID if present.
   */
  extractSessionId(raw: string): string | null {
    // Try JSON parsing first
    const jsonResult = this.tryParseJson(raw);
    if (jsonResult?.sessionId !== undefined && jsonResult.sessionId !== '') {
      return jsonResult.sessionId;
    }

    const extractedJson = this.tryExtractJson(raw);
    if (extractedJson?.sessionId !== undefined && extractedJson.sessionId !== '') {
      return extractedJson.sessionId;
    }

    // Try to extract session ID from text patterns
    return this.extractSessionIdFromText(raw);
  }

  /**
   * Detects and extracts error information from output.
   */
  extractError(raw: string): GeminiErrorInfo | null {
    const lower = raw.toLowerCase();

    if (lower.includes('timeout') || lower.includes('timed out')) {
      return { type: 'timeout', message: this.extractErrorMessage(raw) };
    }

    if (lower.includes('authentication') || lower.includes('unauthorized')) {
      return { type: 'auth', message: this.extractErrorMessage(raw) };
    }

    if (lower.includes('rate limit') || lower.includes('quota exceeded')) {
      return { type: 'rate-limit', message: this.extractErrorMessage(raw) };
    }

    if (lower.includes('error') || lower.includes('failed')) {
      return { type: 'api-error', message: this.extractErrorMessage(raw) };
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Private Strategy Methods
  // -------------------------------------------------------------------------

  private tryParseJson(raw: string): ResilientParseResult | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = this.asRecord(data);
      if (record === null) return null;

      const response = record.response;
      if (typeof response !== 'string') return null;

      const sessionId = this.extractStringField(record, 'session_id');
      const usage = this.extractUsageFromRecord(record);

      const result: ResilientParseResult = {
        response,
        parseStrategy: 'json',
        raw,
      };

      if (sessionId !== undefined) {
        (result as { sessionId?: string }).sessionId = sessionId;
      }
      if (usage !== undefined) {
        (result as { usage?: TokenUsage }).usage = usage;
      }

      return result;
    } catch {
      return null;
    }
  }

  private tryExtractJson(raw: string): ResilientParseResult | null {
    // Look for JSON object patterns in the output
    const jsonPatterns = [
      /\{[\s\S]*"response"\s*:\s*"[\s\S]*"\s*[\s\S]*\}/,
      /\{[\s\S]*"response"\s*:\s*'[\s\S]*'\s*[\s\S]*\}/,
    ];

    for (const pattern of jsonPatterns) {
      const match = pattern.exec(raw);
      if (match !== null) {
        const jsonStr = match[0];
        const result = this.tryParseJson(jsonStr);
        if (result !== null) {
          return { ...result, parseStrategy: 'json-extracted', raw };
        }
      }
    }

    return null;
  }

  private tryExtractFromMarkdown(raw: string): ResilientParseResult | null {
    // Extract content from markdown code blocks
    const codeBlockPattern = /```(?:json)?\s*([\s\S]*?)```/g;
    let match: RegExpExecArray | null = codeBlockPattern.exec(raw);

    while (match !== null) {
      const captured = match[1];
      if (captured !== undefined) {
        const content = captured.trim();

        // Try to parse as JSON
        const jsonResult = this.tryParseJson(content);
        if (jsonResult !== null) {
          return { ...jsonResult, parseStrategy: 'markdown-code-block', raw };
        }
      }

      match = codeBlockPattern.exec(raw);
    }

    // If no JSON found in code blocks, treat entire content as response
    // but only if it looks like substantive output
    if (raw.includes('```')) {
      const cleanedContent = this.extractTextFromMarkdown(raw);
      if (cleanedContent.length > 0) {
        return {
          response: cleanedContent,
          parseStrategy: 'markdown-code-block',
          raw,
        };
      }
    }

    return null;
  }

  private tryPlainText(raw: string): ResilientParseResult | null {
    const trimmed = raw.trim();

    // Skip if empty or looks like an error
    if (trimmed.length === 0) return null;

    // Skip if it looks like just error output
    if (this.isLikelyErrorOutput(trimmed)) return null;

    // Accept as plain text response
    return {
      response: trimmed,
      parseStrategy: 'plain-text',
      raw,
    };
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private extractStringField(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }

  private extractUsageFromRecord(record: Record<string, unknown>): TokenUsage | undefined {
    const stats = this.asRecord(record.stats);
    if (stats === null) return undefined;

    const models = this.asRecord(stats.models);
    if (models === null) return undefined;

    const totals = this.aggregateModelTokens(models);
    if (totals.input === 0 && totals.output === 0) return undefined;

    return {
      inputTokens: totals.input,
      outputTokens: totals.output,
      totalTokens: totals.input + totals.output,
      ...(totals.cached > 0 && { cachedInputTokens: totals.cached }),
    };
  }

  private aggregateModelTokens(models: Record<string, unknown>): {
    input: number;
    output: number;
    cached: number;
  } {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;

    for (const modelStats of Object.values(models)) {
      const modelRecord = this.asRecord(modelStats);
      if (modelRecord === null) continue;

      const tokens = this.asRecord(modelRecord.tokens);
      if (tokens === null) continue;

      const input = this.getNumber(tokens, 'input');
      const candidates = this.getNumber(tokens, 'candidates');
      const cached = this.getNumber(tokens, 'cached');

      if (input !== null) totalInput += input;
      if (candidates !== null) totalOutput += candidates;
      if (cached !== null) totalCached += cached;
    }

    return { input: totalInput, output: totalOutput, cached: totalCached };
  }

  private getNumber(obj: Record<string, unknown>, key: string): number | null {
    const value = obj[key];
    return typeof value === 'number' ? value : null;
  }

  private extractSessionIdFromText(raw: string): string | null {
    // Pattern for Gemini session IDs
    const patterns = [/session[_-]?id[:\s]+["']?([a-zA-Z0-9_-]+)["']?/i, /gem_([a-zA-Z0-9]+)/];

    for (const pattern of patterns) {
      const match = pattern.exec(raw);
      const captured = match?.[1];
      if (captured !== undefined) {
        return captured.startsWith('gem_') ? captured : `gem_${captured}`;
      }
    }

    return null;
  }

  private extractTextFromMarkdown(raw: string): string {
    // Remove code blocks and extract remaining text
    let content = raw;

    // Remove code blocks
    content = content.replace(/```[\s\S]*?```/g, '');

    // Remove markdown formatting
    content = content.replace(/#{1,6}\s+/g, '');
    content = content.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
    content = content.replace(/_([^_]+)_/g, '$1');

    return content.trim();
  }

  private extractErrorMessage(raw: string): string {
    // Try to extract a clean error message
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);

    // Look for error: prefix
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('error:')) {
        return line.replace(/.*error:\s*/i, '').trim();
      }
    }

    // Return first non-empty line as fallback
    return lines[0]?.trim() ?? 'Unknown error';
  }

  private isLikelyErrorOutput(raw: string): boolean {
    const lower = raw.toLowerCase();
    const errorIndicators = [
      'error:',
      'exception:',
      'traceback',
      'stack trace',
      'fatal:',
      'panic:',
    ];

    // Check if output starts with error indicators
    for (const indicator of errorIndicators) {
      if (lower.startsWith(indicator)) return true;
    }

    // Check if it's a short error message
    if (raw.length < 200) {
      const errorKeywords = ['failed', 'error', 'cannot', 'unable to'];
      const hasErrorKeyword = errorKeywords.some((kw) => lower.includes(kw));
      const hasNoContent = !lower.includes('the ') && !lower.includes('this ');
      if (hasErrorKeyword && hasNoContent) return true;
    }

    return false;
  }
}

/**
 * Creates a resilient Gemini parser instance.
 */
export function createResilientGeminiParser(): ResilientGeminiParser {
  return new ResilientGeminiParser();
}
