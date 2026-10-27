/** Active SDK1 wire measurements; native capability refusal is NOT producer RED (#7577). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema, RELATED_TASK_META_KEY } from '@modelcontextprotocol/sdk/types.js';
import type { Expert } from '../../agents/index.js';
import { VERSION } from '../../version.js';
import { createServer } from '../server.js';
import type { McpServer } from '../sdk-types.js';
import { getTaskStore, resetTaskStore } from '../task-store.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import { registerExecuteExpertTool } from './execute-expert.js';
import { _resetForTests as resetConcurrency } from '../jobs/job-concurrency.js';

// Only the provider-discovery boundary is stubbed; SDK/registration/store stay real.
vi.mock('../middleware/adapter-availability.js', () => ({
  requireAdapterAvailable: vi.fn().mockResolvedValue(undefined),
}));

interface RpcHarness {
  client: Client;
  server: McpServer;
  execute: () => Promise<unknown>;
  fetchGuard: () => Promise<never>;
}
const opened: RpcHarness[] = [];
const ARGS = { expertId: 'TEST_FAKE_EXPERT', task: 'TEST_FAKE offline task' };

afterEach(async () => {
  for (const { client, server } of opened.splice(0)) {
    await client.close();
    await server.close();
  }
  resetTaskStore();
  resetConcurrency();
  vi.unstubAllGlobals();
});

function localExecutor(outcome: 'success' | 'error' | 'thrown'): () => Promise<unknown> {
  if (outcome === 'thrown') return vi.fn().mockRejectedValue(new Error('TEST_FAKE_THROWN_FAILURE'));
  return vi.fn().mockResolvedValue(
    outcome === 'success'
      ? {
          ok: true,
          value: {
            output: 'TEST_FAKE_OFFLINE_RESULT',
            metadata: { tokensUsed: 1, durationMs: 0 },
          },
        }
      : { ok: false, error: new Error('TEST_FAKE_OFFLINE_FAILURE') }
  );
}

async function connectLocal(outcome: 'success' | 'error' | 'thrown'): Promise<RpcHarness> {
  const fetchGuard = vi.fn(() =>
    Promise.reject(new Error('Forbidden network fetch in offline test'))
  );
  vi.stubGlobal('fetch', fetchGuard);
  const execute = localExecutor(outcome);
  const expert = {
    id: 'TEST_FAKE_EXPERT',
    role: 'code_expert',
    execute,
    expertConfig: {
      id: 'TEST_FAKE_EXPERT',
      name: 'TEST_FAKE local expert',
      role: 'code_expert',
      capabilities: [],
    },
  } as unknown as Expert;
  const created = createServer({ name: 'TEST_FAKE_provenance' });
  if (!created.ok) throw new Error(created.error.message);
  const server = created.value.server;
  registerExecuteExpertTool(server, {
    expertRegistry: new Map([['TEST_FAKE_EXPERT', expert]]),
    rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100 }),
  });
  const client = new Client({ name: 'TEST_FAKE_inmemory_client', version: 'TEST_FAKE' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const h = {
    client,
    server,
    execute,
    fetchGuard,
  };
  opened.push(h);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return h;
}

describe('execute_expert actual SDK1 producer provenance (#7577)', () => {
  it.each(['success', 'error', 'thrown'] as const)(
    'fallback %s stores and returns producer build metadata',
    async (outcome) => {
      const h = await connectLocal(outcome);
      const result = CallToolResultSchema.parse(
        await h.client.callTool({ name: 'execute_expert', arguments: ARGS })
      );
      const tasks = getTaskStore().getAllTasks();
      expect(tasks).toHaveLength(1);
      const taskId = tasks[0]?.taskId;
      if (taskId === undefined) throw new Error('Expected one actual stored task');
      const stored = await getTaskStore().getTaskResult(taskId);
      expect(h.execute).toHaveBeenCalledTimes(1);
      expect(h.fetchGuard).not.toHaveBeenCalled();
      if (outcome !== 'success') {
        expect(result.isError).toBe(true);
        expect(result._meta?.['nexus-agents/error']).toEqual(stored._meta?.['nexus-agents/error']);
      } else {
        expect(JSON.stringify(result.content)).toContain('TEST_FAKE_OFFLINE_RESULT');
      }
      expect.soft(stored._meta?.['nexus-agents/build']).toEqual({ version: VERSION });
      expect.soft(result._meta?.['nexus-agents/build']).toEqual({ version: VERSION });
    }
  );

  it.each([true, false])(
    'keeps historical SDK producer presence=%s without reader restamping',
    async (producerPresent) => {
      const h = await connectLocal('success');
      const store = getTaskStore();
      const task = await store.createTask({ ttl: 10000 });
      const meta: Record<string, unknown> = { TEST_FAKE_EXISTING: { preserved: true } };
      if (producerPresent) meta['nexus-agents/build'] = { version: 'TEST_FAKE_HISTORICAL_BUILD' };
      const stored = {
        content: [{ type: 'text' as const, text: 'TEST_FAKE stored historical output' }],
        _meta: meta,
      };
      await store.storeTaskResult(task.taskId, 'completed', stored);
      const result = await h.client.experimental.tasks.getTaskResult(
        task.taskId,
        CallToolResultSchema
      );
      expect(result._meta?.['nexus-agents/build']).toEqual(stored._meta['nexus-agents/build']);
      expect(result._meta?.['TEST_FAKE_EXISTING']).toEqual(stored._meta['TEST_FAKE_EXISTING']);
      expect(result._meta?.[RELATED_TASK_META_KEY]).toEqual({ taskId: task.taskId });
      expect(await store.getTaskResult(task.taskId)).toEqual(stored);
      expect(h.execute).not.toHaveBeenCalled();
      expect(h.fetchGuard).not.toHaveBeenCalled();
    }
  );
});
