/**
 * delegate_to_model's V2 instrumentation contract carries the task text's
 * CONTENT tier, not the caller's (#6795). delegate takes no provenance
 * declaration, so a measured tier-1 (stdio) caller's task is still Tier 3.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { RateLimiter } from '../middleware/index.js';
import { recordServerTransport } from '../middleware/request-context.js';
import * as v2 from '../../pipeline/v2-delegate.js';
import { registerDelegateToModelTool } from './delegate-to-model.js';

vi.mock('../../pipeline/v2-delegate.js', () => ({
  delegateInputToTaskContract: vi.fn(),
  executeDelegatePipeline: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../pipeline/v2-config.js', () => ({
  resolveV2Config: vi.fn(() => ({
    delegateEnabled: true,
    orchestrateEnabled: false,
    aorchestraEnabled: false,
    dispatchEnabled: false,
  })),
}));

async function callDelegate(): Promise<void> {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  registerDelegateToModelTool(server, {
    rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100, refillIntervalMs: 1000 }),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  await client.callTool({ name: 'delegate_to_model', arguments: { task: 'Add an endpoint' } });
  await client.close();
  await server.close();
}

afterEach(() => {
  recordServerTransport(undefined);
  vi.mocked(v2.delegateInputToTaskContract).mockClear();
});

describe('delegate_to_model V2 instrumentation tier (#6795)', () => {
  it("a measured tier-1 caller's task reaches the V2 contract as tier '3'", async () => {
    // server.connect bypasses connectTransport, so record the transport as it would.
    recordServerTransport('stdio');
    await callDelegate();
    expect(vi.mocked(v2.delegateInputToTaskContract)).toHaveBeenCalledWith(expect.anything(), {
      trustTier: '3',
    });
  });

  it('an unmeasured caller threads no tier (the policy engine fails closed)', async () => {
    await callDelegate();
    expect(vi.mocked(v2.delegateInputToTaskContract)).toHaveBeenCalledWith(expect.anything(), {});
  });
});
