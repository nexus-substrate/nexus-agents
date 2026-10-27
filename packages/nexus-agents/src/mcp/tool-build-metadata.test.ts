import { describe, expect, it } from 'vitest';
import { VERSION } from '../version.js';
import { buildToolMetadata } from './tool-build-metadata.js';

describe('canonical tool build metadata policy (#7601)', () => {
  it('names the producer when no prior metadata exists', () => {
    expect(buildToolMetadata(undefined)).toEqual({ 'nexus-agents/build': { version: VERSION } });
  });

  it('preserves unrelated/error metadata, overwrites its own key and never mutates input', () => {
    const error = Object.freeze({ errorCategory: 'internal', isRetryable: false });
    const previous = Object.freeze({ version: 'TEST_FAKE_OLD_BUILD' });
    const meta = Object.freeze({
      'nexus-agents/error': error,
      'nexus-agents/build': previous,
      TEST_FAKE_OTHER: { preserved: true },
    });
    const before = structuredClone(meta);
    const result = buildToolMetadata(meta);
    expect(meta).toEqual(before);
    expect(result).not.toBe(meta);
    expect(result['nexus-agents/error']).toBe(error);
    expect(result['TEST_FAKE_OTHER']).toBe(meta.TEST_FAKE_OTHER);
    expect(result['nexus-agents/build']).toEqual({ version: VERSION });
    expect(meta['nexus-agents/build']).toBe(previous);
  });

  it.each([
    { type: 'text', text: 'TEST_FAKE payload' },
    { type: 'image', data: 'TEST_FAKE_IMAGE', mimeType: 'image/png' },
  ])(
    'keeps $type, structured and extra payload fields when the caller attaches metadata',
    (content) => {
      const payload = Object.freeze({
        content: [content],
        structuredContent: [{ value: 'TEST_FAKE structured data' }],
        TEST_FAKE_EXTRA: { preserved: true },
      });
      const result = { ...payload, _meta: buildToolMetadata(undefined) };
      expect(result.content).toBe(payload.content);
      expect(result.structuredContent).toBe(payload.structuredContent);
      expect(result.TEST_FAKE_EXTRA).toBe(payload.TEST_FAKE_EXTRA);
      expect(result._meta['nexus-agents/build']).toEqual({ version: VERSION });
    }
  );
});
