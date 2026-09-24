/**
 * nexus-agents/cli-adapters - Claude CLI Response Parser
 *
 * Defensive parser for Claude CLI JSON output.
 * Handles version 2.0.x output format.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { CliPermissionDenial, ICliResponseParser, TokenUsage } from '../types.js';
import { asRecord, extractNumberField } from '../../utils/type-coercion.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'claude-parser' });

/**
 * Claude CLI response structure.
 * (Source: CLI testing 2026-01-04)
 */
export interface ClaudeCliResponse {
  readonly type: 'result';
  readonly subtype?: 'success' | 'error';
  readonly is_error: boolean;
  /** Why generation stopped — `end_turn` on an answer, `stop_sequence` on the measured error envelope (#6120). */
  readonly stop_reason?: string;
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

/** A cost figure usable as a measurement: finite and not negative. */
function isUsableCost(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Sum the per-model `costUSD` entries, or `null` if none carried one.
 *
 * `null` rather than `0` is the point: "the vendor reported nothing" is not
 * "the vendor reported free", and returning 0 would tell the budget router the
 * call cost nothing.
 */
function sumModelUsageCost(raw: unknown): number | null {
  const modelUsage = asRecord(raw);
  if (modelUsage === null) return null;

  let sum = 0;
  let sawCost = false;
  for (const entry of Object.values(modelUsage)) {
    const perModel = asRecord(entry);
    if (perModel === null) continue;
    const cost = perModel.costUSD;
    if (typeof cost !== 'number' || !isUsableCost(cost)) continue;
    sum += cost;
    sawCost = true;
  }
  return sawCost ? sum : null;
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
      logger.debug('Skipped malformed output line', { snippet: raw.slice(0, 100) });
      return null;
    }
  }

  /**
   * Extracts just the response text (most stable field).
   * Returns null if the response contains an error.
   */
  extractResponse(raw: string): string | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = asRecord(data);
      if (record === null) return null;

      // Check for API errors (is_error: true indicates an error occurred)
      if (record.is_error === true) {
        return null;
      }

      const result = record.result;
      if (typeof result === 'string') {
        return result;
      }

      return null;
    } catch {
      logger.debug('Skipped malformed output line', { snippet: raw.slice(0, 100) });
      return null;
    }
  }

  /**
   * The error text of an `is_error: true` envelope, with its `stop_reason`
   * (#6120).
   *
   * Before this the envelope reached the adapter only through the generic
   * unparseable-output path, whose first step scans the WHOLE stdout for
   * rate-limit text. The out-of-credits envelope carries `api_error_status:
   * 429`, so that scan matched and the error message became the first 500
   * characters of the envelope — `{"duration_api_ms":0,…` — while the one
   * field that names the cause, `result`, never reached anyone. Surfacing it
   * here routes the envelope through `classifyErrorOnlyStream`, which
   * classifies the message text rather than the envelope bytes.
   *
   * `null` when the envelope is not an error, or when `result` is empty: an
   * empty error text is not a message, and the caller's recovery order handles
   * it as before.
   */
  extractErrorMessage(raw: string): string | null {
    try {
      const record = asRecord(JSON.parse(raw));
      if (record?.is_error !== true) return null;

      const result = record.result;
      if (typeof result !== 'string' || result === '') return null;

      const stopReason = record.stop_reason;
      return typeof stopReason === 'string' && stopReason !== ''
        ? `${result} (stop_reason: ${stopReason})`
        : result;
    } catch {
      logger.debug('Skipped malformed output line', { snippet: raw.slice(0, 100) });
      return null;
    }
  }

  /**
   * The tool calls claude's permission layer refused (#6792), from the
   * result envelope's `permission_denials`. `null` when the field is absent
   * or empty, or the output is not JSON; an entry without a tool name is
   * skipped rather than invented.
   */
  extractPermissionDenials(raw: string): CliPermissionDenial[] | null {
    try {
      const denials = asRecord(JSON.parse(raw))?.permission_denials;
      if (!Array.isArray(denials)) return null;
      const parsed = denials.flatMap((entry: unknown): CliPermissionDenial[] => {
        const record = asRecord(entry);
        const toolName = record?.tool_name;
        if (typeof toolName !== 'string' || toolName === '') return [];
        const filePath = asRecord(record?.tool_input)?.file_path;
        return [{ toolName, ...(typeof filePath === 'string' && { filePath }) }];
      });
      return parsed.length > 0 ? parsed : null;
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
      const record = asRecord(data);
      if (record === null) return null;

      const usageRecord = asRecord(record.usage);
      if (usageRecord === null) return null;

      const inputTokens = extractNumberField(usageRecord, 'input_tokens');
      const outputTokens = extractNumberField(usageRecord, 'output_tokens');

      if (inputTokens === null || outputTokens === null) {
        return null;
      }

      const cachedInputTokens = extractNumberField(usageRecord, 'cache_read_input_tokens');
      // Declared on ClaudeResult.usage since forever but never read (#4435) —
      // so a panel's FIRST call, which writes the cache, lost its largest
      // input measurement entirely. Absent stays absent: a fabricated 0 would
      // read as "no cache write happened".
      const cacheCreationInputTokens = extractNumberField(
        usageRecord,
        'cache_creation_input_tokens'
      );

      return {
        inputTokens,
        outputTokens,
        // NOTE: still uncached input + output. Folding the cache figures in
        // here is a semantics change for every consumer of totalTokens and
        // belongs with the threading increment on #4435, not this extraction.
        totalTokens: inputTokens + outputTokens,
        ...(cachedInputTokens !== null && { cachedInputTokens }),
        ...(cacheCreationInputTokens !== null && { cacheCreationInputTokens }),
      };
    } catch {
      logger.debug('Skipped malformed output line', { snippet: raw.slice(0, 100) });
      return null;
    }
  }

  /**
   * Extracts the cost the Claude CLI reported for this call.
   *
   * Prefers `total_cost_usd` — the vendor's own total — over summing
   * `modelUsage[*].costUSD`, because a per-model breakdown can omit a component
   * the total includes. Both are declared on {@link ClaudeCliResponse} and
   * neither reached `CliResponse` before #5241.
   *
   * Rejects a negative or non-finite figure: a cost is a measurement, and
   * letting a corrupt one through would debit the budget router with garbage.
   */
  extractCostUsd(raw: string): number | null {
    try {
      const record = asRecord(JSON.parse(raw));
      if (record === null) return null;

      const total = record.total_cost_usd;
      if (typeof total === 'number') return isUsableCost(total) ? total : null;

      return sumModelUsageCost(record.modelUsage);
    } catch {
      logger.debug('Skipped malformed output line', { snippet: raw.slice(0, 100) });
      return null;
    }
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
      logger.debug('Skipped malformed output line', { snippet: raw.slice(0, 100) });
      return null;
    }
  }

  /**
   * Type guard for valid response structure.
   */
  private isValidResponse(data: unknown): data is ClaudeCliResponse {
    const record = asRecord(data);
    if (record === null) return false;

    // Only require the essential field
    return typeof record.result === 'string';
  }
}
