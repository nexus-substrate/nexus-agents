/**
 * nexus-agents/cli-adapters - Resilient Gemini Parser Helpers
 *
 * Utility functions for parsing Gemini CLI output.
 *
 * (Source: Issue #366 - Gemini CLI timeout and parser improvements)
 */

import type { TokenUsage } from '../types.js';
import type { TokenTotals } from './gemini-parser-resilient-types.js';
import { asRecord, extractStringField, extractNumberField } from '../../utils/type-coercion.js';

// Re-export for backward compatibility
export { asRecord, extractStringField };

/**
 * Aggregates token counts from model stats.
 */
export function aggregateModelTokens(models: Record<string, unknown>): TokenTotals {
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

  return { input: totalInput, output: totalOutput, cached: totalCached };
}

/**
 * Extracts token usage from a parsed record.
 */
export function extractUsageFromRecord(record: Record<string, unknown>): TokenUsage | undefined {
  const stats = asRecord(record.stats);
  if (stats === null) return undefined;

  const models = asRecord(stats.models);
  if (models === null) return undefined;

  const totals = aggregateModelTokens(models);
  if (totals.input === 0 && totals.output === 0) return undefined;

  return {
    inputTokens: totals.input,
    outputTokens: totals.output,
    totalTokens: totals.input + totals.output,
    ...(totals.cached > 0 && { cachedInputTokens: totals.cached }),
  };
}

/**
 * Extracts session ID from text patterns.
 */
export function extractSessionIdFromText(raw: string): string | null {
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

/**
 * Extracts text content from markdown, removing code blocks and formatting.
 */
export function extractTextFromMarkdown(raw: string): string {
  let content = raw;

  // Remove code blocks
  content = content.replace(/```[\s\S]*?```/g, '');

  // Remove markdown formatting
  content = content.replace(/#{1,6}\s+/g, '');
  content = content.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
  content = content.replace(/_([^_]+)_/g, '$1');

  return content.trim();
}

/**
 * Extracts a clean error message from raw output.
 */
export function extractErrorMessage(raw: string): string {
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

/**
 * Checks if output appears to be an error message.
 */
export function isLikelyErrorOutput(raw: string): boolean {
  const lower = raw.toLowerCase();
  const errorIndicators = ['error:', 'exception:', 'traceback', 'stack trace', 'fatal:', 'panic:'];

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
