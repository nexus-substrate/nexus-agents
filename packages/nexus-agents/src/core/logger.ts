/**
 * nexus-agents/core - Structured Logger
 *
 * JSON-structured logging with secret sanitization.
 */

/** Log levels in order of severity */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Log context/metadata */
export interface LogContext {
  [key: string]: unknown;
}

/** Structured log entry */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/** Logger interface */
export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  child(context: LogContext): ILogger;
  setLevel(level: LogLevel): void;
}

/** Patterns to sanitize from logs */
const SECRET_PATTERNS = [
  // API keys (OpenAI, Anthropic)
  /sk-[a-zA-Z0-9-_]{20,}/g,
  // Bearer tokens
  /Bearer [a-zA-Z0-9-_.]+/g,
  // Generic credential patterns
  /password["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /secret["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /token["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  // AWS credentials
  /AKIA[0-9A-Z]{16}/g,
  /aws_secret_access_key["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /aws_session_token["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  // Azure credentials
  /AccountKey=[a-zA-Z0-9+/=]+/gi,
  /SharedAccessSignature=[a-zA-Z0-9%]+/gi,
  /DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[^;]+/gi,
  // GCP credentials
  /"private_key":\s*"-----BEGIN[^"]+-----END[^"]+-----"/g,
  /"private_key_id":\s*"[a-f0-9]+"/gi,
  // GitHub tokens
  /ghp_[a-zA-Z0-9]{36}/g,
  /github_pat_[a-zA-Z0-9_]{22,}/g,
  /gho_[a-zA-Z0-9]{36}/g,
  /ghu_[a-zA-Z0-9]{36}/g,
  /ghs_[a-zA-Z0-9]{36}/g,
  /ghr_[a-zA-Z0-9]{36}/g,
];

/**
 * Field names that should have their values fully redacted.
 * Case-insensitive matching.
 * (Source: OWASP Logging Cheat Sheet)
 */
const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'apikey',
  'api_key',
  'apiKey',
  'token',
  'accesstoken',
  'access_token',
  'accessToken',
  'refreshtoken',
  'refresh_token',
  'refreshToken',
  'bearer',
  'authorization',
  'auth',
  'credential',
  'credentials',
  'private_key',
  'privatekey',
  'privateKey',
  'session',
  'sessionid',
  'session_id',
  'sessionId',
  'cookie',
  'ssn',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'pin',
]);

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Sanitizes a string by redacting known secret patterns.
 */
export function sanitize(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Checks if a field name is sensitive and should be fully redacted.
 */
function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELD_NAMES.has(fieldName.toLowerCase());
}

/**
 * Sanitizes an array, handling circular references.
 */
function sanitizeArray(arr: unknown[], seen: WeakSet<object>): unknown[] {
  if (seen.has(arr)) return ['[Circular]'];
  seen.add(arr);
  return arr.map((item) => sanitizeDeep(item, seen));
}

/**
 * Sanitizes an object, handling circular references and sensitive fields.
 */
function sanitizeObject(obj: object, seen: WeakSet<object>): Record<string, unknown> {
  if (seen.has(obj)) return { _circular: '[Circular]' };
  seen.add(obj);

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    sanitized[key] = isSensitiveField(key) ? '[REDACTED]' : sanitizeDeep(val, seen);
  }
  return sanitized;
}

/**
 * Recursively sanitizes an object, redacting sensitive values.
 * Handles circular references safely.
 * (Source: Issue #185 Phase 1 - Deep object sanitization)
 */
export function sanitizeDeep(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitize(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return sanitizeArray(value, seen);
  if (typeof value === 'object') return sanitizeObject(value, seen);
  return `[${typeof value}]`;
}

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

interface ErrorEntry {
  name: string;
  message: string;
  stack?: string;
}

function formatError(error: Error): ErrorEntry {
  const entry: ErrorEntry = {
    name: error.name,
    message: sanitize(error.message),
  };
  if (error.stack !== undefined) {
    // Sanitize stack traces as they may contain local variable values with secrets
    entry.stack = sanitize(error.stack);
  }
  return entry;
}

function formatEntry(
  level: LogLevel,
  message: string,
  context: LogContext,
  entryContext?: LogContext,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    timestamp: formatTimestamp(new Date()),
    level,
    message: sanitize(message),
  };
  const merged = { ...context, ...entryContext };
  if (Object.keys(merged).length > 0) {
    // Deep sanitize context to prevent secret leakage via nested objects
    entry.context = sanitizeDeep(merged) as LogContext;
  }
  if (error !== undefined) {
    entry.error = formatError(error);
  }
  return entry;
}

function writeLog(level: LogLevel, entry: LogEntry): void {
  const output = JSON.stringify(entry) + '\n';
  if (level === 'debug' || level === 'info') {
    process.stdout.write(output);
  } else {
    process.stderr.write(output);
  }
}

/**
 * Creates a structured JSON logger.
 */
export function createLogger(baseContext?: LogContext): ILogger {
  let currentLevel: LogLevel = 'info';
  const context = baseContext ?? {};

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
  }

  function log(level: LogLevel, msg: string, ctx?: LogContext, e?: Error): void {
    if (shouldLog(level)) {
      writeLog(level, formatEntry(level, msg, context, ctx, e));
    }
  }

  return {
    debug: (msg, ctx): void => {
      log('debug', msg, ctx);
    },
    info: (msg, ctx): void => {
      log('info', msg, ctx);
    },
    warn: (msg, ctx): void => {
      log('warn', msg, ctx);
    },
    error: (msg, e, ctx): void => {
      log('error', msg, ctx, e);
    },
    child: (childCtx): ILogger => createLogger({ ...context, ...childCtx }),
    setLevel: (level): void => {
      currentLevel = level;
    },
  };
}

/** Default logger instance */
export const logger = createLogger();
