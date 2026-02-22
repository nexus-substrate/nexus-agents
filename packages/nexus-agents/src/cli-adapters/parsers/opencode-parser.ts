/**
 * nexus-agents/cli-adapters - OpenCode CLI Response Parser
 *
 * Defensive parser for OpenCode CLI JSON output.
 * Handles `opencode run --format json` NDJSON event stream.
 *
 * (Source: Issue #1124, opencode.ai/docs/cli/)
 */

import type { ICliResponseParser, TokenUsage } from '../types.js';
import { asRecord, extractNumberField } from '../../utils/type-coercion.js';

/**
 * OpenCode CLI NDJSON event types.
 * OpenCode emits events as newline-delimited JSON.
 */
export type OpenCodeEventType =
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

    for (const line of lines) {
      if (line.trim() === '') continue;
      this.processLine(
        line,
        contentParts,
        (id) => (sessionId = id),
        (u) => (usage = u)
      );
    }

    if (contentParts.length === 0) {
      // Fallback: try parsing as plain JSON (non-streaming mode)
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
      try {
        const event: unknown = JSON.parse(line);
        const record = asRecord(event);
        if (record === null) continue;

        if (record.type === 'session.start' || record.type === 'session.complete') {
          const sid = record.session_id ?? record.sessionId;
          if (typeof sid === 'string') return sid;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Processes a single NDJSON line.
   */
  private processLine(
    line: string,
    contentParts: string[],
    setSessionId: (id: string) => void,
    setUsage: (usage: TokenUsage) => void
  ): void {
    try {
      const record = asRecord(JSON.parse(line) as unknown);
      if (record === null) return;

      switch (record.type) {
        case 'session.start':
          this.handleSessionStart(record, setSessionId);
          break;
        case 'message.delta':
          this.pushTextContent(record, contentParts);
          break;
        case 'message.complete':
          this.pushTextContent(record, contentParts);
          this.emitUsage(record, setUsage);
          break;
        case 'session.complete':
          this.emitUsage(record, setUsage);
          break;
      }
    } catch {
      // Skip malformed lines
    }
  }

  /** Extracts session ID from a session event record. */
  private handleSessionStart(
    record: Record<string, unknown>,
    setSessionId: (id: string) => void
  ): void {
    const sid = record.session_id ?? record.sessionId;
    if (typeof sid === 'string') setSessionId(sid);
  }

  /** Pushes text content from a message event into the accumulator. */
  private pushTextContent(record: Record<string, unknown>, parts: string[]): void {
    const text = record.content ?? record.delta ?? record.text;
    if (typeof text === 'string') parts.push(text);
  }

  /** Emits usage from a record if present. */
  private emitUsage(record: Record<string, unknown>, setUsage: (usage: TokenUsage) => void): void {
    const usage = this.extractUsageFromRecord(record);
    if (usage !== null) setUsage(usage);
  }

  /**
   * Fallback parser for plain JSON output (non-streaming).
   */
  private parsePlainJson(raw: string): OpenCodeCliResponse | null {
    try {
      const data: unknown = JSON.parse(raw);
      const record = asRecord(data);
      if (record === null) return null;

      // Try common response field names
      const content = record.content ?? record.result ?? record.text ?? record.output;
      if (typeof content !== 'string') return null;

      const usage = this.extractUsageFromRecord(record);
      const sid = record.session_id ?? record.sessionId;

      return {
        content,
        ...(typeof sid === 'string' && { sessionId: sid }),
        ...(usage !== null && { usage }),
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts usage from a record with usage/token fields.
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
