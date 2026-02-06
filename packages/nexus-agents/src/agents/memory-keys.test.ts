/**
 * Tests for memory-keys.ts
 *
 * Covers getAgentStateKey, getTaskLearningKey, getPatternKey,
 * and getErrorResolutionKey.
 */

import { describe, it, expect } from 'vitest';
import {
  getAgentStateKey,
  getTaskLearningKey,
  getPatternKey,
  getErrorResolutionKey,
} from './memory-keys.js';

describe('getAgentStateKey', () => {
  it('returns key with agent:state prefix', () => {
    expect(getAgentStateKey('agent-1')).toBe('agent:state:agent-1');
  });
});

describe('getTaskLearningKey', () => {
  it('returns key with agent:learning prefix', () => {
    expect(getTaskLearningKey('agent-1', 'learn-42')).toBe('agent:learning:agent-1:learn-42');
  });
});

describe('getPatternKey', () => {
  it('returns key with agent:pattern prefix', () => {
    expect(getPatternKey('agent-1', 'pat-5')).toBe('agent:pattern:agent-1:pat-5');
  });
});

describe('getErrorResolutionKey', () => {
  it('returns key with agent:error prefix', () => {
    const result = getErrorResolutionKey('agent-1', 'TypeError');
    expect(result).toBe('agent:error:agent-1:TypeError');
  });

  it('sanitizes special characters to underscores', () => {
    const result = getErrorResolutionKey('agent-1', 'Error: foo/bar.baz');
    expect(result).toBe('agent:error:agent-1:Error__foo_bar_baz');
  });

  it('truncates long error patterns to 64 chars', () => {
    const longPattern = 'a'.repeat(100);
    const result = getErrorResolutionKey('agent-1', longPattern);
    const suffix = result.split(':').pop();
    expect(suffix?.length).toBeLessThanOrEqual(64);
  });

  it('preserves alphanumeric and hyphens', () => {
    const result = getErrorResolutionKey('agent-1', 'my-error-123');
    expect(result).toBe('agent:error:agent-1:my-error-123');
  });
});
