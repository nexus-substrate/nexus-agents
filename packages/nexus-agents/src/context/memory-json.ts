/** JSON projection for native memory rows exposed through the shared registry. */
import { types } from 'node:util';
import { assertJsonValue, MemoryValidationError } from 'nexus-memory';
import type { JsonValue } from 'nexus-memory';

/**
 * Native context rows carry Dates and optional undefined fields. Explicitly
 * serialize Dates and omit unset object fields before entering the JSON-only
 * registry contract. All other unsupported values remain validation errors.
 */
export function projectMemoryJson(value: unknown): JsonValue {
  const projected = projectNativeValue(value, new WeakMap<object, object>(), '$');
  assertJsonValue(projected);
  return projected;
}

/** Reject hooks before projection; native Dates are explicitly serialized below. */
function assertProjectable(value: unknown, path: string): void {
  if (types.isProxy(value))
    throw new MemoryValidationError('json', 'proxies are not JSON values', path);
  if (value === null || typeof value !== 'object' || value instanceof Date) return;
  if ('toJSON' in value) {
    throw new MemoryValidationError(
      'json',
      'toJSON properties are not JSON values',
      `${path}["toJSON"]`
    );
  }
}

function projectNativeValue(value: unknown, seen: WeakMap<object, object>, path: string): unknown {
  assertProjectable(value, path);
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const isArray = Array.isArray(value);
  if (!hasJsonPrototype(value)) return value;
  const copy: object = isArray ? new Array<unknown>(value.length) : {};
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    if (isArray && key === 'length') continue;
    projectProperty(value, copy, key, seen, path);
  }
  return copy;
}

/** Preserve descriptors so JSON validation rejects hidden/accessor/extra-array fields. */
function projectProperty(
  value: object,
  copy: object,
  key: string | symbol,
  seen: WeakMap<object, object>,
  path: string
): void {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return;
  if ('value' in descriptor && descriptor.enumerable === true && typeof key === 'string') {
    // Undefined object properties represent unset optional native fields.
    if (!Array.isArray(value) && descriptor.value === undefined) return;
    Object.defineProperty(copy, key, {
      ...descriptor,
      value: projectNativeValue(descriptor.value, seen, `${path}[${JSON.stringify(key)}]`),
    });
    return;
  }
  Object.defineProperty(copy, key, descriptor);
}

function hasJsonPrototype(value: object): boolean {
  const isArray = Array.isArray(value);
  const expected = isArray ? Array.prototype : Object.prototype;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === expected || (prototype === null && !isArray);
}
