/**
 * nexus-agents/cli-adapters - Codex CLI Response Parser
 *
 * Defensive parser for Codex CLI NDJSON output.
 * Handles version 0.7x.x output format.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { ICliResponseParser, TokenUsage } from '../types.js';
import { asRecord, extractNumberField } from '../../utils/type-coercion.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'codex-parser' });

/**
 * Codex CLI NDJSON event types.
 */
export type CodexEventType =
  | 'thread.started'
  | 'turn.started'
  | 'item.completed'
  | 'turn.completed';

/**
 * Base Codex event structure.
 */
export interface CodexEvent {
  readonly type: CodexEventType;
}

/**
 * Thread started event.
 */
export interface CodexThreadStarted extends CodexEvent {
  readonly type: 'thread.started';
  readonly thread_id: string;
}

/**
 * Item completed event (contains response or reasoning).
 */
export interface CodexItemCompleted extends CodexEvent {
  readonly type: 'item.completed';
  readonly item: {
    readonly id: string;
    readonly type: string;
    readonly text: string;
  };
}

/**
 * Turn completed event (contains usage).
 */
export interface CodexTurnCompleted extends CodexEvent {
  readonly type: 'turn.completed';
  readonly usage?: {
    readonly input_tokens: number;
    readonly cached_input_tokens?: number;
    readonly output_tokens: number;
  };
}

/**
 * Aggregated Codex response from NDJSON stream.
 */
export interface CodexCliResponse {
  readonly threadId?: string;
  readonly messages: readonly string[];
  readonly reasoning: readonly string[];
  readonly usage?: TokenUsage;
}

/**
 * Parser for Codex CLI NDJSON output.
 * Implements defensive parsing - processes stream of events.
 */
export class CodexResponseParser implements ICliResponseParser<CodexCliResponse> {
  readonly name = 'codex-parser';
  readonly supportedVersionRange = '>=0.70.0 <1.0.0';

  /**
   * Parses complete Codex CLI NDJSON stream.
   */
  parse(raw: string): CodexCliResponse | null {
    const lines = raw.trim().split('\n');
    let threadId: string | undefined;
    const messages: string[] = [];
    const reasoning: string[] = [];
    let usage: TokenUsage | undefined;

    for (const line of lines) {
      if (line.trim() === '') continue;
      this.processLine(
        line,
        messages,
        reasoning,
        (id) => (threadId = id),
        (u) => (usage = u)
      );
    }

    if (messages.length === 0 && reasoning.length === 0) {
      return null;
    }

    return {
      messages,
      reasoning,
      ...(threadId !== undefined && { threadId }),
      ...(usage !== undefined && { usage }),
    };
  }

  /**
   * Processes a single NDJSON line.
   */
  private processLine(
    line: string,
    messages: string[],
    reasoning: string[],
    setThreadId: (id: string) => void,
    setUsage: (usage: TokenUsage) => void
  ): void {
    try {
      const event: unknown = JSON.parse(line);
      const record = asRecord(event);
      if (record === null) return;

      const eventType = record.type;

      if (eventType === 'thread.started') {
        const tid = record.thread_id;
        if (typeof tid === 'string') setThreadId(tid);
      } else if (eventType === 'item.completed') {
        this.processItemCompleted(record, messages, reasoning);
      } else if (eventType === 'turn.completed') {
        const usage = this.extractUsageFromEvent(record);
        if (usage !== null) setUsage(usage);
      }
    } catch {
      // Skip malformed NDJSON lines
      logger.debug('Skipped malformed NDJSON line', { snippet: line.slice(0, 100) });
    }
  }

  /**
   * Extracts just the response text (most stable field).
   * Concatenates all agent_message items.
   */
  extractResponse(raw: string): string | null {
    const parsed = this.parse(raw);
    if (parsed === null || parsed.messages.length === 0) {
      return null;
    }

    return parsed.messages.join('\n');
  }

  /**
   * Extracts token usage from NDJSON stream.
   */
  extractUsage(raw: string): TokenUsage | null {
    const lines = raw.trim().split('\n');

    for (const line of lines) {
      if (line.trim() === '') continue;

      try {
        const event: unknown = JSON.parse(line);
        const record = asRecord(event);
        if (record === null) continue;

        if (record.type === 'turn.completed') {
          return this.extractUsageFromEvent(record);
        }
      } catch {
        logger.debug('Skipped malformed NDJSON line', { snippet: line.slice(0, 100) });
        continue;
      }
    }

    return null;
  }

  /**
   * Extracts session ID (thread_id) for resumption.
   */
  extractSessionId(raw: string): string | null {
    const lines = raw.trim().split('\n');

    for (const line of lines) {
      if (line.trim() === '') continue;

      try {
        const event: unknown = JSON.parse(line);
        const record = asRecord(event);
        if (record === null) continue;

        if (record.type === 'thread.started') {
          const threadId = record.thread_id;
          if (typeof threadId === 'string') {
            return threadId;
          }
        }
      } catch {
        logger.debug('Skipped malformed NDJSON line', { snippet: line.slice(0, 100) });
        continue;
      }
    }

    return null;
  }

  /**
   * Processes an item.completed event.
   */
  private processItemCompleted(
    record: Record<string, unknown>,
    messages: string[],
    reasoning: string[]
  ): void {
    const item = asRecord(record.item);
    if (item === null) return;

    const itemType = item.type;
    const text = item.text;

    if (typeof text !== 'string') return;

    if (itemType === 'agent_message') {
      messages.push(text);
    } else if (itemType === 'reasoning') {
      reasoning.push(text);
    }
  }

  /**
   * Extracts usage from a turn.completed event.
   */
  private extractUsageFromEvent(record: Record<string, unknown>): TokenUsage | null {
    const usage = asRecord(record.usage);
    if (usage === null) return null;

    const inputTokens = extractNumberField(usage, 'input_tokens');
    const outputTokens = extractNumberField(usage, 'output_tokens');

    if (inputTokens === null || outputTokens === null) {
      return null;
    }

    const cachedInputTokens = extractNumberField(usage, 'cached_input_tokens');

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      ...(cachedInputTokens !== null && { cachedInputTokens }),
    };
  }
}
