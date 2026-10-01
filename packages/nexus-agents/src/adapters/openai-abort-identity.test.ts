/** SDK abort identity must survive the real OpenAI error transformer (#6851). */
import { APIUserAbortError } from 'openai/core/error';
import { expect, it } from 'vitest';
import type { ModelError } from '../core/index.js';
import { isCallerAbortError } from '../cli-adapters/cli-error-helpers.js';
import { FAKE_OPENAI_KEY } from '../testing/test-secrets.js';
import { OpenAIAdapter } from './openai-adapter.js';

class AbortIdentityAdapter extends OpenAIAdapter {
  transformForTest(error: unknown): ModelError {
    return this.transformError(error);
  }
}

it('recognizes caller abort through the actual OpenAI SDK error transformation', () => {
  const adapter = new AbortIdentityAdapter({ modelId: 'gpt-4o', apiKey: FAKE_OPENAI_KEY });
  const error = adapter.transformForTest(new APIUserAbortError());
  expect(error.cause).toBeInstanceOf(Error);
  expect(isCallerAbortError(error)).toBe(true);
});
