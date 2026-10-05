import { describe, expect, it } from 'vitest';
import { projectMemoryJson } from './memory-json.js';

describe('projectMemoryJson', () => {
  it('rejects a nested proxy before its projection can hide it', () => {
    const value = new Proxy(
      { n: 1 },
      {
        get(target, key, receiver) {
          if (key === 'toJSON') return () => ({ n: 'invalid' });
          return Reflect.get(target, key, receiver) as unknown;
        },
      }
    );
    expect(() => projectMemoryJson({ nested: value })).toThrow(/\$\["nested"\]/);
    expect(() => projectMemoryJson(value)).toThrow(/proxies/i);
  });

  it('rejects an own toJSON property rather than omitting it as an unset field', () => {
    expect(() => projectMemoryJson({ nested: { n: 1, toJSON: undefined } })).toThrow(
      /\$\["nested"\]\["toJSON"\]/
    );
  });

  it('rejects inherited toJSON rather than removing its prototype during projection', () => {
    const original = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
    Object.defineProperty(Object.prototype, 'toJSON', {
      value: null,
      writable: true,
      configurable: true,
    });
    try {
      expect(() => projectMemoryJson({ n: 1 })).toThrow(/\$\["toJSON"\]/);
    } finally {
      if (original === undefined) Reflect.deleteProperty(Object.prototype, 'toJSON');
      else Object.defineProperty(Object.prototype, 'toJSON', original);
    }
  });

  it('projects native Dates and unset fields without retaining caller references', () => {
    const value = { at: new Date(0), unset: undefined, nested: { n: 1 }, array: [null, true] };
    const projected = projectMemoryJson(value);
    value.nested.n = 2;
    expect(projected).toEqual({
      at: new Date(0).toISOString(),
      nested: { n: 1 },
      array: [null, true],
    });
  });
});
