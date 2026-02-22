/**
 * Tests for tool-error-handler.
 * (Source: Issue #1144)
 */

import { describe, it, expect, vi } from 'vitest';
import { toolErrorResponse, withToolError } from './tool-error-handler.js';
import type { ILogger } from '../../core/index.js';

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as ILogger;
}

describe('toolErrorResponse', () => {
  it('returns isError response with prefix and message from Error', () => {
    const result = toolErrorResponse('Add paper failed', new Error('Network timeout'));
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('Add paper failed: Network timeout');
  });

  it('handles non-Error thrown values', () => {
    const result = toolErrorResponse('Query failed', 'string error');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Query failed: string error');
  });

  it('handles undefined error', () => {
    const result = toolErrorResponse('Op failed', undefined);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Op failed:');
  });

  it('logs error when logger is provided', () => {
    const logger = createMockLogger();
    toolErrorResponse('Write failed', new Error('disk full'), logger);
    expect(logger.error).toHaveBeenCalledWith('Write failed', expect.any(Error));
  });

  it('does not log when logger is omitted', () => {
    const result = toolErrorResponse('Silent fail', new Error('oops'));
    expect(result.isError).toBe(true);
  });

  it('wraps non-Error values in Error for logging', () => {
    const logger = createMockLogger();
    toolErrorResponse('Wrapped', 42, logger);
    expect(logger.error).toHaveBeenCalledWith('Wrapped', expect.any(Error));
  });
});

describe('withToolError', () => {
  it('returns handler result on success', async () => {
    const logger = createMockLogger();
    const result = await withToolError('Op failed', logger, () =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: '{"ok":true}' }],
      })
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('{"ok":true}');
  });

  it('catches thrown Error and returns standardized response', async () => {
    const logger = createMockLogger();
    const result = await withToolError('Memory write failed', logger, () =>
      Promise.reject(new Error('Backend unavailable'))
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Memory write failed: Backend unavailable');
    expect(logger.error).toHaveBeenCalled();
  });

  it('catches non-Error throws', async () => {
    const logger = createMockLogger();
    const result = await withToolError('Op failed', logger, () =>
      Promise.reject(new Error('raw string error'))
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Op failed: raw string error');
  });

  it('preserves isError from handler result', async () => {
    const logger = createMockLogger();
    const result = await withToolError('Op', logger, () =>
      Promise.resolve({
        isError: true as const,
        content: [{ type: 'text' as const, text: 'Validation error' }],
      })
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Validation error');
    expect(logger.error).not.toHaveBeenCalled();
  });
});
