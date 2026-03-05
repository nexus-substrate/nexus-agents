/**
 * nexus-agents/cli-adapters - OpenCode CLI Response Parser
 *
 * Defensive parser for OpenCode CLI JSON output.
 * Handles `opencode run --format json` NDJSON event stream.
 *
 * Real opencode v1.2.x NDJSON format (verified via E2E testing):
 *   {"type":"step_start","sessionID":"ses_...","part":{"type":"step-start",...}}
 *   {"type":"text","sessionID":"ses_...","part":{"type":"text","text":"Hello!",...}}
 *   {"type":"step_finish","sessionID":"ses_...","part":{"type":"step-finish","tokens":{...},...}}
 *
 * (Source: Issue #1124, #1244, opencode.ai/docs/cli/)
 */

import type { ICliResponseParser, TokenUsage } from '../types.js';
import { asRecord, extractNumberField } from '../../utils/type-coercion.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'opencode-parser' });

/** Minimum raw text length for plaintext fallback (#1402). */
const PLAINTEXT_MIN_LENGTH = 10;

/** Returns true if text looks like NDJSON (most non-empty lines start with '{' ). */
function looksLikeNdjson(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return false;
  const jsonLineCount = lines.filter((l) => l.trimStart().startsWith('{')).length;
  return jsonLineCount > lines.length / 2;
}

/**
 * OpenCode CLI NDJSON event types.
 * Includes both real v1.2.x types and legacy assumed types for compatibility.
 */
export type OpenCodeEventType =
  // Real opencode v1.2.x event types
  | 'step_start'
  | 'text'
  | 'tool_use'
  | 'step_finish'
  // Legacy assumed types (maintained for backward compatibility)
  | 'session.start'
  | 'message.start'
  | 'message.delta'
  | 'message.complete'
  | 'session.complete';

/**
 * Aggregated OpenCode response from NDJSON stream.
 */
export interface OpenCodeCliResponse {
  readonly sessionId?: string;
  readonly content: string;
  readonly usage?: TokenUsage;
}

/**
 * Parser for OpenCode CLI JSON output.
 * Handles NDJSON event stream from `opencode run --format json`.
 *
 * Supports both real opencode v1.2.x format and legacy assumed format.
 */
export class OpenCodeResponseParser implements ICliResponseParser<OpenCodeCliResponse> {
  readonly name = 'opencode-parser';
  readonly supportedVersionRange = '>=1.0.0 <2.0.0';

  /**
   * Parses complete OpenCode CLI NDJSON stream.
   */
  parse(raw: string): OpenCodeCliResponse | null {
    const lines = raw.trim().split('\n');
    let sessionId: string | undefined;
    const contentParts: string[] = [];
    let usage: TokenUsage | undefined;
    let hasStepEvents = false;

    for (const line of lines) {
      if (line.trim() === '') continue;
      const hadEvent = this.processLine(
        line,
        contentParts,
        (id) => (sessionId = id),
        (u) => (usage = u)
      );
      if (hadEvent) hasStepEvents = true;
    }

    if (contentParts.length === 0) {
      // Tool-only responses have step_start/step_finish but no text events.
      // Return empty content rather than null to avoid PARSE_ERROR.
      if (hasStepEvents) {
        return {
          content: '[Tool-only response — no text output]',
          ...(sessionId !== undefined && { sessionId }),
          ...(usage !== undefined && { usage }),
        };
      }
      // Fallback: try parsing as plain JSON (non-streaming mode)
      logger.debug('No NDJSON content extracted, trying JSON fallback', {
        rawLength: raw.length,
        lineCount: lines.length,
        hasStepEvents,
      });
      return this.parsePlainJson(raw);
    }

    const content = contentParts.join('');
    return {
      content,
      ...(sessionId !== undefined && { sessionId }),
      ...(usage !== undefined && { usage }),
    };
  }

  /**
   * Extracts just the response text.
   */
  extractResponse(raw: string): string | null {
    const parsed = this.parse(raw);
    if (parsed === null || parsed.content === '') {
      logger.debug('extractResponse returned null', {
        rawLength: raw.length,
        snippet: raw.slice(0, 100),
        parsedNull: parsed === null,
      });
      return null;
    }
    return parsed.content;
  }

  /**
   * Extracts token usage from response.
   */
  extractUsage(raw: string): TokenUsage | null {
    const lines = raw.trim().split('\n');

    for (const line of lines) {
      if (line.trim() === '') continue;
      try {
        const event: unknown = JSON.parse(line);
        const record = asRecord(event);
        if (record === null) continue;

        // Real format: step_finish with nested part.tokens
        if (record.type === 'step_finish') {
          const usage = this.extractUsageFromPart(record);
          if (usage !== null) return usage;
        }

        // Legacy format: session.complete or message.complete with usage field
        if (record.type === 'session.complete' || record.type === 'message.complete') {
          const usage = this.extractUsageFromRecord(record);
          if (usage !== null) return usage;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Extracts session ID for resumption.
   */
  extractSessionId(raw: string): string | null {
    const lines = raw.trim().split('\n');

    for (const line of lines) {
      if (line.trim() === '') continue;
      const sid = this.extractSessionIdFromLine(line);
      if (sid !== null) return sid;
    }

    return null;
  }

  /** Extracts session ID from a single NDJSON line. */
  private extractSessionIdFromLine(line: string): string | null {
    try {
      const record = asRecord(JSON.parse(line) as unknown);
      if (record === null) return null;

      // Real format: sessionID at top level (step_start, text, step_finish)
      if (typeof record.sessionID === 'string') return record.sessionID;

      // Legacy format: session_id/sessionId in session events
      const sid = record.session_id ?? record.sessionId;
      if (typeof sid === 'string') return sid;

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Processes a single NDJSON line.
   * Handles both real v1.2.x format and legacy assumed format.
   * Returns true if a real v1.2.x step event was processed (step_start/text/tool_use/step_finish).
   * Legacy events return false since they don't indicate tool-only responses.
   */
  private processLine(
    line: string,
    contentParts: string[],
    setSessionId: (id: string) => void,
    setUsage: (usage: TokenUsage) => void
  ): boolean {
    try {
      const record = asRecord(JSON.parse(line) as unknown);
      if (record === null) return false;

      const isReal = this.processRealEvent(record, contentParts, setSessionId, setUsage);
      if (isReal) return true;

      this.processLegacyEvent(record, contentParts, setSessionId, setUsage);
      return false;
    } catch (lineErr: unknown) {
      // Skip malformed NDJSON lines — capture for debuggability
      void lineErr;
      return false;
    }
  }

  /** Processes real opencode v1.2.x event types. Returns true if handled. */
  private processRealEvent(
    record: Record<string, unknown>,
    contentParts: string[],
    setSessionId: (id: string) => void,
    setUsage: (usage: TokenUsage) => void
  ): boolean {
    switch (record.type) {
      case 'step_start':
      case 'tool_use':
        this.handleRealSessionId(record, setSessionId);
        return true;
      case 'text':
        this.handleRealSessionId(record, setSessionId);
        this.pushRealTextContent(record, contentParts);
        return true;
      case 'step_finish':
        this.handleRealSessionId(record, setSessionId);
        this.emitRealUsage(record, setUsage);
        return true;
      default:
        return false;
    }
  }

  /** Processes legacy assumed event types. */
  private processLegacyEvent(
    record: Record<string, unknown>,
    contentParts: string[],
    setSessionId: (id: string) => void,
    setUsage: (usage: TokenUsage) => void
  ): void {
    switch (record.type) {
      case 'session.start':
        this.handleLegacySessionStart(record, setSessionId);
        break;
      case 'message.delta':
        this.pushLegacyTextContent(record, contentParts);
        break;
      case 'message.complete':
        this.pushLegacyTextContent(record, contentParts);
        this.emitLegacyUsage(record, setUsage);
        break;
      case 'session.complete':
        this.emitLegacyUsage(record, setUsage);
        break;
    }
  }

  // --- Real v1.2.x format handlers ---

  /** Extracts sessionID from top-level field (real format). */
  private handleRealSessionId(
    record: Record<string, unknown>,
    setSessionId: (id: string) => void
  ): void {
    if (typeof record.sessionID === 'string') setSessionId(record.sessionID);
  }

  /** Extracts text from nested part.text field (real format). */
  private pushRealTextContent(record: Record<string, unknown>, parts: string[]): void {
    const part = asRecord(record.part);
    if (part === null) return;

    if (typeof part.text === 'string') parts.push(part.text);
  }

  /** Extracts usage from nested part.tokens field (real format). */
  private emitRealUsage(
    record: Record<string, unknown>,
    setUsage: (usage: TokenUsage) => void
  ): void {
    const usage = this.extractUsageFromPart(record);
    if (usage !== null) setUsage(usage);
  }

  /** Extracts usage from part.tokens (real opencode v1.2.x format). */
  private extractUsageFromPart(record: Record<string, unknown>): TokenUsage | null {
    const part = asRecord(record.part);
    if (part === null) return null;

    const tokens = asRecord(part.tokens);
    if (tokens === null) return null;

    const inputTokens = extractNumberField(tokens, 'input');
    const outputTokens = extractNumberField(tokens, 'output');

    if (inputTokens === null || outputTokens === null) return null;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  // --- Legacy format handlers ---

  /** Extracts session ID from a session event record (legacy format). */
  private handleLegacySessionStart(
    record: Record<string, unknown>,
    setSessionId: (id: string) => void
  ): void {
    const sid = record.session_id ?? record.sessionId;
    if (typeof sid === 'string') setSessionId(sid);
  }

  /** Pushes text content from a message event (legacy format). */
  private pushLegacyTextContent(record: Record<string, unknown>, parts: string[]): void {
    const text = record.content ?? record.delta ?? record.text;
    if (typeof text === 'string') parts.push(text);
  }

  /** Emits usage from a record (legacy format). */
  private emitLegacyUsage(
    record: Record<string, unknown>,
    setUsage: (usage: TokenUsage) => void
  ): void {
    const usage = this.extractUsageFromRecord(record);
    if (usage !== null) setUsage(usage);
  }

  /**
   * Fallback parser for plain JSON output (non-streaming).
   * Falls back to raw plaintext if JSON parsing fails and content is substantial (#1402).
   */
  private parsePlainJson(raw: string): OpenCodeCliResponse | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = asRecord(data);
      if (record === null) return this.parsePlaintext(raw);

      // Try common response field names
      const content = record.content ?? record.result ?? record.text ?? record.output;
      if (typeof content !== 'string') return this.parsePlaintext(raw);

      const usage = this.extractUsageFromRecord(record);
      const sid = record.session_id ?? record.sessionId;

      return {
        content,
        ...(typeof sid === 'string' ? { sessionId: sid } : {}),
        ...(usage !== null ? { usage } : {}),
      };
    } catch {
      return this.parsePlaintext(raw);
    }
  }

  /**
   * Last-resort plaintext fallback for non-JSON CLI output (#1402).
   * Returns raw text as content when it has substantial length and
   * doesn't look like malformed NDJSON (which should fail as PARSE_ERROR).
   */
  private parsePlaintext(raw: string): OpenCodeCliResponse | null {
    const trimmed = raw.trim();
    if (trimmed.length < PLAINTEXT_MIN_LENGTH) {
      logger.debug('Plaintext fallback rejected: too short', { length: trimmed.length });
      return null;
    }
    // Don't fallback if input looks like NDJSON — let it fail as PARSE_ERROR
    if (looksLikeNdjson(trimmed)) {
      logger.debug('Plaintext fallback rejected: looks like NDJSON', { length: trimmed.length });
      return null;
    }
    return { content: trimmed };
  }

  /**
   * Extracts usage from a record with usage/token fields (legacy format).
   */
  private extractUsageFromRecord(record: Record<string, unknown>): TokenUsage | null {
    const usage = asRecord(record.usage);
    if (usage === null) return null;

    const inputTokens =
      extractNumberField(usage, 'input_tokens') ?? extractNumberField(usage, 'inputTokens');
    const outputTokens =
      extractNumberField(usage, 'output_tokens') ?? extractNumberField(usage, 'outputTokens');

    if (inputTokens === null || outputTokens === null) return null;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }
}
