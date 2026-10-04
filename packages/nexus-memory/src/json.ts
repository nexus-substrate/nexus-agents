/** Shared JSON boundary for all memory backends. Dates must be serialized by callers. */
import type { z } from 'zod';
import { types } from 'node:util';
import type { JsonValue } from './types.js';

export class MemoryValidationError extends Error {
  constructor(
    readonly domain: string,
    cause: unknown,
    readonly path = '$'
  ) {
    super(`nexus-memory: write rejected for domain "${domain}" at ${path}: ${String(cause)}`);
    this.name = 'MemoryValidationError';
  }
}

/** A stored row could not be decoded or validated; no partial query is returned. */
export class MemoryReadError extends Error {
  constructor(
    readonly domain: string,
    readonly key: string,
    cause: unknown
  ) {
    super(`nexus-memory: invalid stored row "${key}" in domain "${domain}"`, { cause });
    this.name = 'MemoryReadError';
  }
}

export function assertStringKey(key: unknown, domain: string): asserts key is string {
  if (typeof key !== 'string') {
    throw new MemoryValidationError(domain, 'key must be a string', '$key');
  }
}

interface JsonInspection {
  readonly domain: string;
  readonly ancestors: Set<object>;
}

function inspectProperty(
  value: object,
  key: string | symbol,
  path: string,
  context: JsonInspection
): JsonValue {
  const childPath = `${path}[${typeof key === 'symbol' ? String(key) : JSON.stringify(key)}]`;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (typeof key === 'symbol' || descriptor?.enumerable !== true || !('value' in descriptor)) {
    throw new MemoryValidationError(
      context.domain,
      'only enumerable string data properties are JSON values',
      childPath
    );
  }
  if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
    throw new MemoryValidationError(
      context.domain,
      'extra array properties are not JSON values',
      childPath
    );
  }
  return inspectJson(descriptor.value, childPath, context);
}

function inspectProperties(value: object, path: string, context: JsonInspection): JsonValue {
  const copy: Record<string, JsonValue> | JsonValue[] = Array.isArray(value) ? [] : {};
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) {
        throw new MemoryValidationError(
          context.domain,
          'sparse arrays are not JSON values',
          `${path}[${String(i)}]`
        );
      }
    }
  }
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const child = inspectProperty(value, key, path, context);
    // Define data properties so literal __proto__ keys cannot invoke setters.
    Object.defineProperty(copy, key, {
      value: child,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

function inspectObject(value: object, path: string, context: JsonInspection): JsonValue {
  const prototype: unknown = Object.getPrototypeOf(value);
  const expected = Array.isArray(value) ? Array.prototype : Object.prototype;
  if (prototype !== expected && !(prototype === null && !Array.isArray(value))) {
    throw new MemoryValidationError(
      context.domain,
      'non-plain prototype (serialize Dates explicitly)',
      path
    );
  }
  // Null-prototype inputs normalize to standard objects, which must also be hook-free.
  if ('toJSON' in value || 'toJSON' in expected) {
    throw new MemoryValidationError(
      context.domain,
      'toJSON properties are not JSON values',
      `${path}["toJSON"]`
    );
  }
  if (context.ancestors.has(value))
    throw new MemoryValidationError(context.domain, 'cyclic value', path);
  context.ancestors.add(value);
  const copy = inspectProperties(value, path, context);
  context.ancestors.delete(value);
  return copy;
}

function inspectJson(value: unknown, path: string, context: JsonInspection): JsonValue {
  if (types.isProxy(value))
    throw new MemoryValidationError(context.domain, 'proxies are not JSON values', path);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value;
  } else if (typeof value === 'object') {
    return inspectObject(value, path, context);
  }
  throw new MemoryValidationError(
    context.domain,
    'expected a JSON value (finite number; use null for absence)',
    path
  );
}

/** Reject lossy JSON coercions without invoking accessors or toJSON hooks. */
export function assertJsonValue(value: unknown, domain = 'json'): asserts value is JsonValue {
  inspectJson(value, '$', { domain, ancestors: new Set() });
}

function freezeJson(value: JsonValue): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeJson(child);
  Object.freeze(value);
}

/** Validate and freeze a fresh snapshot before checking it; ignore schema transforms. */
export function validateMemoryValue<T extends JsonValue>(
  value: unknown,
  domain: string,
  schema?: z.ZodType<T>
): T {
  const copy = inspectJson(value, '$', { domain, ancestors: new Set() }) as T;
  freezeJson(copy);
  if (schema === undefined) return copy;
  const result = schema.safeParse(copy);
  if (!result.success) {
    const path =
      '$' +
      (result.error.issues[0]?.path ?? [])
        .map((key) => `[${JSON.stringify(String(key))}]`)
        .join('');
    throw new MemoryValidationError(domain, result.error, path);
  }
  return copy;
}

/** Return fresh mutable JSON data without invoking accessors or serialization hooks. */
export function copyJson<T extends JsonValue>(value: T): T {
  return inspectJson(value, '$', { domain: 'json', ancestors: new Set() }) as T;
}
