import { describe, expect, it } from 'vitest';
import { ConfigError } from '../core/errors.js';
import {
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
