/**
 * Tests for query_task_state MCP tool (#2046).
 */

import { describe, it, expect, vi } from 'vitest';
import { QueryTaskStateInputSchema } from './query-task-state-tool.js';

describe('QueryTaskStateInputSchema', () => {
  it('accepts a valid task id', () => {
    const r = QueryTaskStateInputSchema.safeParse({ taskId: 'orch-xyz-123' });
    expect(r.success).toBe(true);
  });

  it('rejects empty task id', () => {
    const r = QueryTaskStateInputSchema.safeParse({ taskId: '' });
    expect(r.success).toBe(false);
  });

  it('rejects task id over 128 chars', () => {
    const r = QueryTaskStateInputSchema.safeParse({ taskId: 'x'.repeat(129) });
    expect(r.success).toBe(false);
  });

  it('rejects missing taskId', () => {
    const r = QueryTaskStateInputSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe('tool registration', () => {
  it('registers query_task_state tool with correct name', async () => {
    const { registerQueryTaskStateTool } = await import('./query-task-state-tool.js');
    const { RateLimiter } = await import('../middleware/rate-limiter.js');
    const rateLimiter = new RateLimiter({ capacity: 100, refillPerSecond: 10 });

    const registerTool = vi.fn();
    const mockServer = { registerTool } as unknown as Parameters<
      typeof registerQueryTaskStateTool
    >[0];

    registerQueryTaskStateTool(mockServer, {
      rateLimiter,
    });

    expect(registerTool).toHaveBeenCalledWith(
      'query_task_state',
      expect.objectContaining({
        description: expect.stringContaining('structured state log') as string,
      }),
      expect.any(Function)
    );
  });
});
