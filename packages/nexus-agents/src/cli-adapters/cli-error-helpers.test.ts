import { APIUserAbortError as OpenAiAbortError } from 'openai/core/error';
import { APIUserAbortError as AnthropicAbortError } from '@anthropic-ai/sdk/core/error';
import { describe, expect, it } from 'vitest';
import { isCallerCancelled } from '../adapters/abort-utils.js';
import { ConfigError, ModelError } from '../core/errors.js';
import {
  createCallerAbortCliError,
  isCallerAbortError,
  createCallerInputCliError,
  createCliError,
  createHostUnavailableCliError,
  isHostUnavailableCliError,
} from './cli-error-helpers.js';

describe('host-unavailable CLI error identity (#6846)', () => {
  it('marks the execution error with a host-unavailable cause', () => {
    const error = createHostUnavailableCliError('Sandbox unavailable', 'codex');
    expect(error).toMatchObject({
      code: 'EXECUTION_ERROR',
      message: 'Sandbox unavailable',
      cli: 'codex',
      retryable: false,
    });
    expect(error.cause).toBeInstanceOf(ConfigError);
    expect(error.cause?.message).toBe('Sandbox unavailable');
    expect(isHostUnavailableCliError(error)).toBe(true);
  });

  it('does not mistake caller input errors for host-unavailable errors', () => {
    expect(isHostUnavailableCliError(createCallerInputCliError('Bad model', 'codex'))).toBe(false);
  });

  it('does not mistake a forwarded ConfigError cause for a host refusal', () => {
    // Adapters forward arbitrary caught errors as the cause (e.g.
    // codex-mcp-adapter), so a plain ConfigError must not stop retries.
    const error = createCliError('EXECUTION_ERROR', 'boom', 'codex', new ConfigError('boom'));
    expect(isHostUnavailableCliError(error)).toBe(false);
  });

  it('does not mistake plain execution errors for host-unavailable errors', () => {
    const error = createCliError('EXECUTION_ERROR', 'Sandbox unavailable', 'codex');
    expect(error.retryable).toBe(false);
    expect(isHostUnavailableCliError(error)).toBe(false);
  });
});

describe('caller-abort measurement identity (#6851)', () => {
  it('preserves deadline timeout behavior and its identity across the model bridge', () => {
    const error = createCallerAbortCliError(
      new DOMException('deadline', 'TimeoutError'),
      'aborted',
      'codex'
    );
    expect(error).toMatchObject({ code: 'TIMEOUT', retryable: true });
    expect(isCallerCancelled(error)).toBe(false);
    expect(
      isCallerAbortError(
        new ModelError(error.message, error.cause === undefined ? {} : { cause: error.cause })
      )
    ).toBe(true);
  });

  it('recognizes an operator abort while preserving its cancellation semantics', () => {
    const error = createCallerAbortCliError('cancelled', 'aborted', 'codex');
    expect(error).toMatchObject({ code: 'EXECUTION_ERROR', retryable: false });
    expect(isCallerCancelled(error)).toBe(true);
    expect(isCallerAbortError(error)).toBe(true);
  });

  it('does not classify an ordinary timeout or failure as a caller abort', () => {
    expect(isCallerAbortError(createCliError('TIMEOUT', 'timeout', 'codex'))).toBe(false);
    expect(
      isCallerAbortError(
        createCliError(
          'TIMEOUT',
          'timeout',
          'codex',
          new DOMException('adapter timeout', 'TimeoutError')
        )
      )
    ).toBe(false);
    expect(isCallerAbortError(new ModelError('adapter failure'))).toBe(false);
  });
});

it.each([new OpenAiAbortError(), new AnthropicAbortError()])(
  'recognizes an SDK caller-abort cause after error transformation: %s',
  (cause) => {
    expect(isCallerAbortError(new ModelError('aborted', { cause }))).toBe(true);
  }
);

it('recognizes a caller abort nested by the OpenAI error transformer', () => {
  const probe = new Error('SDK wrapper', { cause: new OpenAiAbortError() });
  expect(isCallerAbortError(new ModelError('aborted', { cause: probe }))).toBe(true);
});

it('terminates a cyclic cause chain without classifying it as an abort', () => {
  const cause = new Error('adapter failure');
  cause.cause = cause;
  expect(isCallerAbortError(new ModelError('failure', { cause }))).toBe(false);
});

it('does not classify a nested adapter timeout as a caller abort', () => {
  const cause = new Error('SDK wrapper', {
    cause: new DOMException('adapter timeout', 'TimeoutError'),
  });
  expect(isCallerAbortError(new ModelError('timeout', { cause }))).toBe(false);
});
