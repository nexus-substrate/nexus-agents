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
  | 'error'
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
  /**
   * Concatenated error-event messages emitted during the NDJSON stream.
   * Set whenever `{"type":"error",...}` events appeared. Independent of
   * whether `content` is empty — if both are populated the model produced
   * text and then errored, callers can decide what to do.
   * #2821: previously error events were folded into `content` (making
   * failures look like successful responses to consensus voters/routers).
   */
  readonly errorMessage?: string;
}

/** Internal state from processing NDJSON lines. */
interface NdjsonParseState {
  readonly sessionId: string | undefined;
  readonly contentParts: string[];
  readonly errorMessages: string[];
  readonly usage: TokenUsage | undefined;
  readonly hasStepEvents: boolean;
  readonly hasAnyRecognizedEvent: boolean;
  readonly finishReason: string | undefined;
}

/** Mutable collectors shared by event handlers. */
interface NdjsonCollectors {
  readonly contentParts: string[];
  readonly errorMessages: string[];
  finishReason: string | undefined;
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
    const state = this.processAllLines(lines);

    const errorMessage =
      state.errorMessages.length > 0
        ? state.errorMessages.join('; ')
        : state.hasAnyRecognizedEvent
          ? this.terminalError(state.finishReason, state.contentParts.join(''))
          : undefined;

    if (state.contentParts.length === 0) {
      // #2821: error-only streams must surface as failure. Empty content +
      // errorMessage set causes extractResponse() to return null, which the
      // subprocess-adapter then classifies as EXECUTION_ERROR — instead of
      // wrapping `[OpenCode error: ...]` in ok() and feeding it to voters.
      if (errorMessage !== undefined) {
        return this.buildResponse('', state.sessionId, state.usage, errorMessage);
      }
      return this.handleEmptyContent(raw, lines.length, state);
    }

    return this.buildResponse(
      state.contentParts.join(''),
      state.sessionId,
      state.usage,
      errorMessage
    );
  }

  /** AI SDK terminal reasons: unverified endings never authorize a successful turn (#7073). */
  private terminalError(reason: string | undefined, content: string): string | undefined {
    switch (reason) {
      case 'stop':
        return undefined;
      case 'length':
        // CliResponse has no truncation field; retain the produced partial text.
        return content.trim() !== '' ? undefined : 'OpenCode length ending produced no text';
      case 'content-filter':
      case 'error':
      case 'tool-calls':
      case 'other':
      case 'unknown':
      default:
        return `OpenCode turn did not finish successfully: ${reason ?? 'missing terminal reason'}`;
    }
  }

  /** Processes all NDJSON lines and returns aggregated state. */
  private processAllLines(lines: readonly string[]): NdjsonParseState {
    let sessionId: string | undefined;
    const contentParts: string[] = [];
    const errorMessages: string[] = [];
    const collectors: NdjsonCollectors = { contentParts, errorMessages, finishReason: undefined };
    let usage: TokenUsage | undefined;
    let hasStepEvents = false;
    let hasAnyRecognizedEvent = false;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (line === undefined || line.trim() === '') continue;
      const hadEvent = this.processLine(
        line,
        collectors,
        (id) => (sessionId = id),
        (u) => (usage = u),
        idx
      );
      if (hadEvent) hasStepEvents = true;
      if (hadEvent || this.isRecognizedLegacyEvent(line)) hasAnyRecognizedEvent = true;
    }

    return {
      sessionId,
      contentParts,
      errorMessages,
      usage,
      hasStepEvents,
      hasAnyRecognizedEvent,
      finishReason: collectors.finishReason,
    };
  }

  /** Handles the case where no text content was extracted from NDJSON. */
  private handleEmptyContent(
    raw: string,
    lineCount: number,
    state: NdjsonParseState
  ): OpenCodeCliResponse | null {
    // Tool-only responses have step_start/step_finish but no text events.
    if (state.hasStepEvents && state.finishReason === 'stop') {
      return this.buildResponse(
        '[Tool-only response — no text output]',
        state.sessionId,
        state.usage
      );
    }
    // Fallback: try parsing as plain JSON (non-streaming mode)
    logger.debug('No NDJSON content extracted, trying JSON fallback', {
      rawLength: raw.length,
      lineCount,
      hasStepEvents: state.hasStepEvents,
      hasAnyRecognizedEvent: state.hasAnyRecognizedEvent,
    });
    return this.parsePlainJson(raw);
  }

  /** Builds an OpenCodeCliResponse from parsed components. */
  private buildResponse(
    content: string,
    sessionId: string | undefined,
    usage: TokenUsage | undefined,
    errorMessage?: string
  ): OpenCodeCliResponse {
    return {
      content,
      ...(sessionId !== undefined && { sessionId }),
      ...(usage !== undefined && { usage }),
      ...(errorMessage !== undefined && { errorMessage }),
    };
  }

  /**
   * Extracts just the response text.
   */
  extractResponse(raw: string): string | null {
    const parsed = this.parse(raw);
    if (parsed === null || parsed.content === '' || parsed.errorMessage !== undefined) {
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
   * Surfaces stream errors or an incomplete turn, including after partial
   * text. A terminal `stop`, or `length` with text, authorizes success. The subprocess adapter
   * consumes this when {@link extractResponse} returns `null`, so an upstream
   * 401 / rate-limit is classified by its message (NOT_AUTHENTICATED /
   * RATE_LIMITED with a remediation hint) instead of falling through to a
   * generic PARSE_ERROR.
   */
  extractErrorMessage(raw: string): string | null {
    return this.parse(raw)?.errorMessage ?? null;
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
    collectors: NdjsonCollectors,
    setSessionId: (id: string) => void,
    setUsage: (usage: TokenUsage) => void,
    lineIndex: number
  ): boolean {
    try {
      const record = asRecord(JSON.parse(line) as unknown);
      if (record === null) return false;

      const isReal = this.processRealEvent(record, collectors, setSessionId, setUsage);
      if (isReal) return true;

      this.processLegacyEvent(record, collectors, setSessionId, setUsage);
      return false;
    } catch {
      logger.debug('Skipped malformed NDJSON line', {
        lineNumber: lineIndex + 1,
        snippet: line.slice(0, 100),
      });
      return false;
    }
  }

  /** Processes real opencode v1.2.x event types. Returns true if handled. */
  private processRealEvent(
    record: Record<string, unknown>,
    collectors: NdjsonCollectors,
    setSessionId: (id: string) => void,
    setUsage: (usage: TokenUsage) => void
  ): boolean {
    switch (record.type) {
      case 'step_start':
      case 'tool_use':
        collectors.finishReason = undefined;
        this.handleRealSessionId(record, setSessionId);
        return true;
      case 'text':
        collectors.finishReason = undefined;
        this.handleRealSessionId(record, setSessionId);
        this.pushRealTextContent(record, collectors.contentParts);
        return true;
      case 'step_finish': {
        const reason = asRecord(record.part)?.reason;
        collectors.finishReason = typeof reason === 'string' ? reason : undefined;
        this.handleRealSessionId(record, setSessionId);
        this.emitRealUsage(record, setUsage);
        return true;
      }
      case 'error':
        this.handleRealSessionId(record, setSessionId);
        this.captureErrorMessage(record, collectors.errorMessages);
        return true;
      default:
        return false;
    }
  }

  /**
   * Captures an error-event message for the response's `errorMessage` field
   * (#2821). Previously this pushed `[OpenCode error: ...]` into `contentParts`,
   * which made error-only streams look like successful responses to consensus
   * voters and the routing learner.
   */
  private captureErrorMessage(record: Record<string, unknown>, errorMessages: string[]): void {
    const errorObj = asRecord(record.error);
    if (errorObj === null) {
      errorMessages.push('Unknown error');
      return;
    }

    const data = asRecord(errorObj.data);
    const message =
      data !== null && typeof data.message === 'string'
        ? data.message
        : typeof errorObj.name === 'string'
          ? errorObj.name
          : 'Unknown error';

    logger.warn('OpenCode returned error event', { message });
    errorMessages.push(message);
  }

  /** Processes legacy assumed event types. */
  private processLegacyEvent(
    record: Record<string, unknown>,
    collectors: NdjsonCollectors,
    setSessionId: (id: string) => void,
    setUsage: (usage: TokenUsage) => void
  ): void {
    switch (record.type) {
      case 'session.start':
        collectors.finishReason = undefined;
        this.handleLegacySessionStart(record, setSessionId);
        break;
      case 'message.start':
        collectors.finishReason = undefined;
        break;
      case 'message.delta':
        collectors.finishReason = undefined;
        this.pushLegacyTextContent(record, collectors.contentParts);
        break;
      case 'message.complete':
        this.pushLegacyTextContent(record, collectors.contentParts);
        collectors.finishReason = this.legacyFinishReason(record);
        this.emitLegacyUsage(record, setUsage);
        break;
      case 'session.complete':
        collectors.finishReason = this.legacyFinishReason(record);
        this.emitLegacyUsage(record, setUsage);
        break;
    }
  }

  /** Reads the terminal reason from legacy completion envelopes. */
  private legacyFinishReason(record: Record<string, unknown>): string | undefined {
    const reason = record.reason ?? record.finish_reason ?? record.finishReason;
    return typeof reason === 'string' ? reason : undefined;
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

  /** Checks if a line contains a recognized legacy event type (without full parsing). */
  private isRecognizedLegacyEvent(line: string): boolean {
    try {
      const record = asRecord(JSON.parse(line) as unknown);
      if (record === null) return false;
      const t = record.type;
      return (
        t === 'session.start' ||
        t === 'message.start' ||
        t === 'message.delta' ||
        t === 'message.complete' ||
        t === 'session.complete'
      );
    } catch {
      return false;
    }
  }

  /** Reads inherited plain JSON fields without treating an unverified envelope as success. */
  private parsePlainJson(raw: string): OpenCodeCliResponse | null {
    try {
      const record = asRecord(JSON.parse(raw) as unknown);
      if (record === null) return null;
      const content = record.content ?? record.result ?? record.text ?? record.output;
      if (typeof content !== 'string') return null;
      const usage = this.extractUsageFromRecord(record);
      const sid = record.session_id ?? record.sessionId;
      return {
        content,
        errorMessage: 'OpenCode JSON envelope has no verified terminal event',
        ...(typeof sid === 'string' ? { sessionId: sid } : {}),
        ...(usage !== null ? { usage } : {}),
      };
    } catch {
      // #7073 supersedes #1402: --format json cannot authorize plaintext success.
      return null;
    }
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
