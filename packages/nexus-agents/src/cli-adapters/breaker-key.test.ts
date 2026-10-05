/** Internal failure-domain identity invariants (#7070). */
import { describe, expect, it } from 'vitest';
import { breakerKeys } from './breaker-key.js';
import { isEndpointArmId } from './types.js';

describe('breakerKeys.forArm', () => {
  it.each(['UPPERCASE', 'x'.repeat(100)])('hashes invalid identity %s without throwing', (name) => {
    const key = breakerKeys.forArm({ name });
    expect(isEndpointArmId(key)).toBe(true);
    expect(key).toMatch(/^api:[a-f0-9]{40}$/);
    expect(breakerKeys.forArm({ name })).toBe(key);
  });

  it('uses the canonical registry route for Qwen with or without the OpenRouter prefix', () => {
    const canonical = breakerKeys.forArm({ name: 'opencode', model: 'openrouter-qwen-coder' });
    expect(canonical).not.toBe('opencode');
    expect(breakerKeys.forArm({ name: 'opencode', model: 'qwen/qwen3-coder' })).toBe(canonical);
    expect(breakerKeys.forArm({ name: 'opencode', model: 'openrouter/qwen/qwen3-coder' })).toBe(
      canonical
    );
  });

  it('isolates a bare unknown model; only the known default or omitted model uses the default route', () => {
    expect(breakerKeys.forArm({ name: 'opencode', model: 'unlisted-model' })).not.toBe('opencode');
    expect(breakerKeys.forArm({ name: 'opencode', model: 'unlisted-model' })).not.toBe(
      breakerKeys.forArm({ name: 'opencode', model: 'another-unlisted-model' })
    );
    expect(breakerKeys.forArm({ name: 'opencode' })).toBe('opencode');
    expect(breakerKeys.forArm({ name: 'opencode', model: 'opencode-default' })).toBe('opencode');
    expect(breakerKeys.forArm({ name: 'opencode', model: 'anthropic/claude-sonnet-4-6' })).toBe(
      'opencode'
    );
  });
});
