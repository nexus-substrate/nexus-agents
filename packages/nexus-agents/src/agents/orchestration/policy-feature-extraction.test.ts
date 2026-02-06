/**
 * Tests for Policy Feature Extraction
 *
 * @module agents/orchestration/policy-feature-extraction.test
 */

import { describe, it, expect } from 'vitest';
import {
  extractKeywords,
  detectStuckState,
  inferLastPattern,
  extractFeatures,
} from './policy-feature-extraction.js';
import type { AgentStepOutput, PuppeteerState } from './puppeteer-state-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeOutput(agentId: string, output: string, step = 0): AgentStepOutput {
  return { step, agentId, output, durationMs: 100, tokensUsed: 50, model: 'test' };
}

function makeState(overrides: Partial<PuppeteerState> = {}): PuppeteerState {
  return {
    step: 0,
    task: { id: 't1', description: 'implement a sorting algorithm', context: {} },
    agentOutputs: [],
    context: '',
    metadata: { progress: 0.5, totalCost: 0, totalTokens: 0, elapsedMs: 0, startedAt: '' },
    sessionId: 'sess-1',
    ...overrides,
  };
}

// ============================================================================
// extractKeywords
// ============================================================================

describe('extractKeywords', () => {
  it('extracts meaningful words', () => {
    const keywords = extractKeywords('Implement a sorting algorithm for the data');
    expect(keywords).toContain('implement');
    expect(keywords).toContain('sorting');
    expect(keywords).toContain('algorithm');
    expect(keywords).toContain('data');
  });

  it('filters short words (length <= 2)', () => {
    const keywords = extractKeywords('a is on it do be at');
    expect(keywords).toHaveLength(0);
  });

  it('filters stopwords', () => {
    const keywords = extractKeywords('the and but for with this that');
    // Stopwords should be filtered
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('and');
  });

  it('lowercases all keywords', () => {
    const keywords = extractKeywords('IMPLEMENT Sorting ALGORITHM');
    for (const kw of keywords) {
      expect(kw).toBe(kw.toLowerCase());
    }
  });

  it('limits to 10 keywords', () => {
    const longDesc = Array.from({ length: 20 }, (_, i) => `keyword${String(i)}`).join(' ');
    const keywords = extractKeywords(longDesc);
    expect(keywords.length).toBeLessThanOrEqual(10);
  });

  it('handles empty string', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('splits on non-word characters', () => {
    // \W+ splits on hyphens and dots, but underscore is a word char
    const keywords = extractKeywords('foo-bar.qux');
    expect(keywords).toContain('foo');
    expect(keywords).toContain('bar');
    expect(keywords).toContain('qux');
  });
});

// ============================================================================
// detectStuckState
// ============================================================================

describe('detectStuckState', () => {
  it('returns false with fewer than 2 outputs', () => {
    expect(detectStuckState([])).toBe(false);
    expect(detectStuckState([makeOutput('agent-1', 'hello')])).toBe(false);
  });

  it('returns true when last two outputs are identical', () => {
    const outputs = [
      makeOutput('agent-1', 'exact same output'),
      makeOutput('agent-2', 'exact same output'),
    ];
    expect(detectStuckState(outputs)).toBe(true);
  });

  it('returns false when outputs are different', () => {
    const outputs = [
      makeOutput('agent-1', 'first analysis of the code'),
      makeOutput('agent-2', 'completely different review output'),
    ];
    expect(detectStuckState(outputs)).toBe(false);
  });

  it('handles non-string outputs by JSON.stringifying', () => {
    const outputs = [makeOutput('agent-1', ''), makeOutput('agent-2', '')];
    // Replace output with object
    const o1 = { ...outputs[0]!, output: { key: 'value' } };
    const o2 = { ...outputs[1]!, output: { key: 'value' } };
    expect(detectStuckState([o1, o2])).toBe(true);
  });
});

// ============================================================================
// inferLastPattern
// ============================================================================

describe('inferLastPattern', () => {
  it('returns undefined for empty outputs', () => {
    expect(inferLastPattern([])).toBeUndefined();
  });

  it('returns decomposition for decomposer agent', () => {
    const outputs = [makeOutput('task-decomposer', 'output')];
    expect(inferLastPattern(outputs)).toBe('decomposition');
  });

  it('returns reflection for reflector agent', () => {
    const outputs = [makeOutput('quality-reflector', 'output')];
    expect(inferLastPattern(outputs)).toBe('reflection');
  });

  it('returns refinement for refiner agent', () => {
    const outputs = [makeOutput('code-refiner', 'output')];
    expect(inferLastPattern(outputs)).toBe('refinement');
  });

  it('returns critique for critic agent', () => {
    const outputs = [makeOutput('peer-critic', 'output')];
    expect(inferLastPattern(outputs)).toBe('critique');
  });

  it('returns execution for executor agent', () => {
    const outputs = [makeOutput('task-executor', 'output')];
    expect(inferLastPattern(outputs)).toBe('execution');
  });

  it('returns termination for terminator agent', () => {
    const outputs = [makeOutput('session-terminator', 'output')];
    expect(inferLastPattern(outputs)).toBe('termination');
  });

  it('returns undefined for unrecognized agent', () => {
    const outputs = [makeOutput('custom-agent-xyz', 'output')];
    expect(inferLastPattern(outputs)).toBeUndefined();
  });

  it('uses the last output only', () => {
    const outputs = [makeOutput('task-decomposer', 'first'), makeOutput('code-refiner', 'second')];
    expect(inferLastPattern(outputs)).toBe('refinement');
  });
});

// ============================================================================
// extractFeatures
// ============================================================================

describe('extractFeatures', () => {
  it('extracts step count from state', () => {
    const state = makeState({ step: 5 });
    const features = extractFeatures(state);
    expect(features.stepCount).toBe(5);
  });

  it('extracts progress from metadata', () => {
    const state = makeState();
    const features = extractFeatures({ ...state, metadata: { ...state.metadata, progress: 0.75 } });
    expect(features.progress).toBe(0.75);
  });

  it('extracts recent agent IDs (last 3)', () => {
    const outputs = [
      makeOutput('agent-a', 'out1', 0),
      makeOutput('agent-b', 'out2', 1),
      makeOutput('agent-c', 'out3', 2),
      makeOutput('agent-d', 'out4', 3),
    ];
    const state = makeState({ agentOutputs: outputs, step: 4 });
    const features = extractFeatures(state);

    expect(features.recentAgents).toHaveLength(3);
    expect(features.recentAgents).toEqual(['agent-b', 'agent-c', 'agent-d']);
  });

  it('extracts task keywords', () => {
    const state = makeState();
    const features = extractFeatures(state);
    expect(features.taskKeywords).toContain('implement');
    expect(features.taskKeywords).toContain('sorting');
    expect(features.taskKeywords).toContain('algorithm');
  });

  it('includes lastPattern when agent matches', () => {
    const outputs = [makeOutput('task-decomposer', 'result')];
    const state = makeState({ agentOutputs: outputs });
    const features = extractFeatures(state);
    expect(features.lastPattern).toBe('decomposition');
  });

  it('omits lastPattern when no match', () => {
    const outputs = [makeOutput('generic-agent', 'result')];
    const state = makeState({ agentOutputs: outputs });
    const features = extractFeatures(state);
    expect(features.lastPattern).toBeUndefined();
  });

  it('detects stuck state', () => {
    const outputs = [
      makeOutput('agent-1', 'same output repeated'),
      makeOutput('agent-2', 'same output repeated'),
    ];
    const state = makeState({ agentOutputs: outputs });
    const features = extractFeatures(state);
    expect(features.isStuck).toBe(true);
  });

  it('handles empty state', () => {
    const state = makeState({ agentOutputs: [], step: 0 });
    const features = extractFeatures(state);
    expect(features.stepCount).toBe(0);
    expect(features.recentAgents).toEqual([]);
    expect(features.isStuck).toBe(false);
    expect(features.lastPattern).toBeUndefined();
  });
});
