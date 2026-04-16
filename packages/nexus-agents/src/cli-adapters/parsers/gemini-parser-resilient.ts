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
import type { ResilientParseResult, GeminiErrorInfo } from './gemini-parser-resilient-types.js';
import { extractJsonObject } from '../../core/index.js';
import {
  asRecord,
  extractStringField,
  extractUsageFromRecord,
  extractSessionIdFromText,
  extractTextFromMarkdown,
  extractErrorMessage,
  isLikelyErrorOutput,
} from './gemini-parser-resilient-helpers.js';

// Re-export types for backward compatibility
export type {
  ResilientParseResult,
  ParseStrategy,
  GeminiErrorInfo,
} from './gemini-parser-resilient-types.js';

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
    return extractSessionIdFromText(raw);
  }

  /**
   * Detects and extracts error information from output.
   */
  extractError(raw: string): GeminiErrorInfo | null {
    const lower = raw.toLowerCase();

    if (lower.includes('timeout') || lower.includes('timed out')) {
      return { type: 'timeout', message: extractErrorMessage(raw) };
    }

    if (lower.includes('authentication') || lower.includes('unauthorized')) {
      return { type: 'auth', message: extractErrorMessage(raw) };
    }

    if (lower.includes('rate limit') || lower.includes('quota exceeded')) {
      return { type: 'rate-limit', message: extractErrorMessage(raw) };
    }

    if (lower.includes('error') || lower.includes('failed')) {
      return { type: 'api-error', message: extractErrorMessage(raw) };
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Private Strategy Methods
  // -------------------------------------------------------------------------

  private tryParseJson(raw: string): ResilientParseResult | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = asRecord(data);
      if (record === null) return null;

      const response = record.response;
      if (typeof response !== 'string') return null;

      const sessionId = extractStringField(record, 'session_id');
      const usage = extractUsageFromRecord(record);

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
    // ReDoS-safe extraction (#1912): previously used compound patterns like
    // `/\{[\s\S]*"response"\s*:\s*"[\s\S]*"\s*[\s\S]*\}/` which have THREE
    // `[\s\S]*` groups — catastrophic backtracking on large non-matching
    // input. Now we extract the JSON object via indexOf/lastIndexOf (O(n))
    // and let tryParseJson validate the "response" field structurally.
    const candidate = extractJsonObject(raw);
    if (candidate === undefined) return null;
    const result = this.tryParseJson(candidate);
    if (result !== null) {
      return { ...result, parseStrategy: 'json-extracted', raw };
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
      const cleanedContent = extractTextFromMarkdown(raw);
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
    if (isLikelyErrorOutput(trimmed)) return null;

    // Accept as plain text response
    return {
      response: trimmed,
      parseStrategy: 'plain-text',
      raw,
    };
  }
}

/**
 * Creates a resilient Gemini parser instance.
 */
export function createResilientGeminiParser(): ResilientGeminiParser {
  return new ResilientGeminiParser();
}
