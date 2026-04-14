/**
 * @nexus-agents/core - Structured Logger with Correlation IDs
 *
 * Enhanced logger with correlation ID support for distributed tracing.
 */

import type { ConfigLoadResult } from './config-loader.js';

/**
 * Log levels in order of severity.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log context/metadata.
 */
export interface LogContext {
  readonly [key: string]: unknown;
}

/**
 * Structured log entry.
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger interface with correlation ID support.
 */
export interface CorrelationLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  child(context: LogContext): CorrelationLogger;
  setLevel(level: LogLevel): void;
  setCorrelationId(correlationId: string): void;
  setTraceInfo(traceId: string, spanId?: string): void;
}

/**
 * Default log level from environment.
 */
function getDefaultLogLevel(): LogLevel {
  const envLevel = process.env.NEXUS_LOG_LEVEL?.toLowerCase();
  if (envLevel === 'debug' || envLevel === 'info' || envLevel === 'warn' || envLevel === 'error') {
    return envLevel;
  }
  return 'info';
}

/**
 * Level priority for filtering.
 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Generates a correlation ID.
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `corr_${timestamp}_${random}`;
}

/**
 * Generates a trace ID.
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a span ID.
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Formats timestamp in ET timezone.
 */
function formatTimestamp(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(date);
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? '-05:00';
  const base = date.toLocaleString('sv-SE', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  return base.replace(' ', 'T') + offset.replace('GMT', '');
}

/**
 * Formats an error for logging.
 */
function formatError(error: Error): { name: string; message: string; stack: string } {
  const result: { name: string; message: string; stack: string } = {
    name: error.name,
    message: error.message,
    stack: error.stack ?? '',
  };
  return result;
}

/**
 * Creates a correlation logger.
 *
 * @param baseContext - Optional base context
 * @returns CorrelationLogger instance
 *
 * @example
 * ```typescript
 * const logger = createCorrelationLogger({ service: 'api' });
 * logger.setCorrelationId('req_123');
 * logger.info('Request received', { method: 'GET' });
 * ```
 */
// eslint-disable-next-line max-lines-per-function -- closure-based factory captures mutable state
export function createCorrelationLogger(baseContext?: LogContext): CorrelationLogger {
  let currentLevel: LogLevel = getDefaultLogLevel();
  let correlationId: string | undefined;
  let traceId: string | undefined;
  let spanId: string | undefined;
  const context = baseContext ?? {};

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
  }

  function log(level: LogLevel, msg: string, ctx?: LogContext, err?: Error): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: formatTimestamp(new Date()),
      level,
      message: msg,
    };

    if (correlationId !== undefined) {
      entry.correlationId = correlationId;
    }
    if (traceId !== undefined) {
      entry.traceId = traceId;
    }
    if (spanId !== undefined) {
      entry.spanId = spanId;
    }

    const merged = { ...context, ...ctx };
    if (Object.keys(merged).length > 0) {
      entry.context = merged;
    }

    if (err !== undefined) {
      entry.error = formatError(err);
    }

    // stderr: stdout is reserved for MCP stdio JSON-RPC frames.
    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  return {
    debug: (msg, ctx) => {
      log('debug', msg, ctx);
    },
    info: (msg, ctx) => {
      log('info', msg, ctx);
    },
    warn: (msg, ctx) => {
      log('warn', msg, ctx);
    },
    error: (msg, err, ctx) => {
      log('error', msg, ctx, err);
    },
    child: (childCtx): CorrelationLogger => {
      const mergedContext = { ...context, ...childCtx };
      return createCorrelationLogger(mergedContext);
    },
    setLevel: (level) => {
      currentLevel = level;
    },
    setCorrelationId: (id) => {
      correlationId = id;
    },
    setTraceInfo: (tid, sid) => {
      traceId = tid;
      spanId = sid;
    },
  };
}

/**
 * Default correlation logger instance.
 */
export const correlationLogger = createCorrelationLogger();

/**
 * Creates a logger with request/response correlation.
 */
export function createRequestLogger(requestId: string): CorrelationLogger {
  const logger = createCorrelationLogger({ requestId });
  logger.setCorrelationId(requestId);
  return logger;
}

/**
 * Loads logging configuration from environment.
 */
export function loadLoggingConfig(): ConfigLoadResult<{ level: LogLevel }> {
  const level = (process.env.NEXUS_LOG_LEVEL?.toLowerCase() as LogLevel | undefined) ?? 'info';
  return { ok: true, value: { level } };
}
