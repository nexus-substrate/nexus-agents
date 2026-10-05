/** Compile-time pins for the JSON-only backend contract (#5979). */
import { expectTypeOf, it } from 'vitest';
import type { IMemoryBackend, JsonValue } from './types.js';

it('requires string keys and JSON-shaped values', () => {
  expectTypeOf<Parameters<IMemoryBackend<string, JsonValue>['write']>[0]>().toEqualTypeOf<string>();
  expectTypeOf<
    Parameters<IMemoryBackend<string, JsonValue>['write']>[1]
  >().toEqualTypeOf<JsonValue>();
  // @ts-expect-error -- object keys are outside the contract.
  expectTypeOf<IMemoryBackend<{ id: string }, JsonValue>>().toBeObject();
  // @ts-expect-error -- Date must be explicitly serialized by the caller.
  expectTypeOf<IMemoryBackend<string, { at: Date }>>().toBeObject();
  // @ts-expect-error -- unknown is not evidence of JSON data.
  expectTypeOf<IMemoryBackend<string, unknown>>().toBeObject();
});
