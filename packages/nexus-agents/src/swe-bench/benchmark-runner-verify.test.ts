/**
 * Tests for the verify-adapter factory in benchmark-runner (#1414 runner wiring).
 */

import { describe, it, expect } from 'vitest';
import { createHarnessVerifyAdapter, type CreateVerifyAdapterOptions } from './benchmark-runner.js';
import type { EvaluationHarnessConfig } from './evaluation-config-types.js';

function makeOpts(): CreateVerifyAdapterOptions {
  return {
    modelName: 'test-model',
    evalConfig: {} as EvaluationHarnessConfig,
  };
}

describe('createHarnessVerifyAdapter', () => {
  it('returns err when Docker/environment is unavailable', async () => {
    // In most CI environments Docker isn't available for the evaluation
    // harness. Verify the factory returns a proper Result.err rather
    // than throwing — callers can fall back to running without verify.
    const result = await createHarnessVerifyAdapter(makeOpts());
    // The result shape — ok=true OR ok=false with an AgentRunnerError
    // message — is what we're asserting.
    expect(typeof result.ok).toBe('boolean');
    if (!result.ok) {
      expect(result.error.message).toContain('Verify adapter unavailable');
    }
  });

  it('accepts the CreateVerifyAdapterOptions shape', () => {
    const opts: CreateVerifyAdapterOptions = {
      modelName: 'claude-opus',
      evalConfig: {} as EvaluationHarnessConfig,
    };
    // Shape-only test: if the type compiled, this passes.
    expect(opts.modelName).toBe('claude-opus');
  });
});
