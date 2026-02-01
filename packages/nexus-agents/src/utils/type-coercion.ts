/**
 * nexus-agents/utils - Type Coercion Utilities
 *
 * Safe type coercion helpers for parsing and validating unknown values.
 * Consolidates patterns used across parsers, validators, and adapters.
 *
 * @module utils/type-coercion
 */

/**
 * Safely casts value to Record if it's a non-null, non-array object.
 *
 * @param value - Value to check
 * @returns Record if valid object, null otherwise
 *
 * @example
 * const data = asRecord(parsed);
 * if (data !== null) {
 *   const name = asString(data.name);
 * }
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Type guard version of asRecord for use in conditionals.
 *
 * @param value - Value to check
 * @returns True if value is a non-null, non-array object
 *
 * @example
 * if (isRecord(data)) {
 *   console.log(data.field);
 * }
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely extracts a string value.
 *
 * @param value - Value to check
 * @returns String if valid, null otherwise
 */
export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Safely extracts a number value.
 *
 * @param value - Value to check
 * @returns Number if valid (not NaN, not Infinity), null otherwise
 */
export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

/**
 * Safely extracts a boolean value.
 *
 * @param value - Value to check
 * @returns Boolean if valid, null otherwise
 */
export function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * Safely extracts an array value.
 *
 * @param value - Value to check
 * @returns Array if valid, null otherwise
 */
export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

/**
 * Extracts a string field from a record.
 *
 * @param record - Record to extract from
 * @param key - Field key
 * @returns String value or undefined if not found/invalid
 */
export function extractStringField(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extracts a number field from a record.
 *
 * @param record - Record to extract from
 * @param key - Field key
 * @returns Number value or null if not found/invalid
 */
export function extractNumberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Extracts a boolean field from a record.
 *
 * @param record - Record to extract from
 * @param key - Field key
 * @returns Boolean value or undefined if not found/invalid
 */
export function extractBooleanField(
  record: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Extracts a nested record field from a record.
 *
 * @param record - Record to extract from
 * @param key - Field key
 * @returns Nested record or null if not found/invalid
 */
export function extractRecordField(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  return asRecord(record[key]);
}

/**
 * Safely parses JSON with fallback to null.
 *
 * @param raw - Raw JSON string
 * @returns Parsed value or null if invalid
 */
export function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Safely parses JSON and returns as Record.
 *
 * @param raw - Raw JSON string
 * @returns Parsed record or null if invalid
 */
export function safeJsonParseRecord(raw: string): Record<string, unknown> | null {
  const parsed = safeJsonParse(raw);
  return asRecord(parsed);
}
