/** Protocol evidence for startup workflow availability (#7043 / #5132). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { registerMcpTools } from '../cli-server-tools.js';
import { SecurityConfigSchema } from '../config/schemas-security.js';
import { createLogger, ok, type IModelAdapter, type WorkflowDefinition } from '../core/index.js';
import { createRealWorkflowEngine } from '../workflows/workflow-engine-factory.js';
import { RateLimiter } from './middleware/rate-limiter.js';
import { registerRunWorkflowTool } from './tools/run-workflow.js';

const workflow: WorkflowDefinition = {
  name: 'availability-probe',
  version: '1.0.0',
  inputs: [],
  steps: [{ id: 'analyze', agent: 'code_expert', action: 'analyze', inputs: {} }],
};

function makeAdapter(): IModelAdapter {
  return {
    providerId: 'test',
    modelId: 'test-model',
    capabilities: ['completion'],
    complete: vi.fn<IModelAdapter['complete']>().mockResolvedValue(
      ok({
        content: [{ type: 'text', text: 'Workflow step executed' }],
        stopReason: 'end_turn',
        model: 'test-model',
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      })
    ),
    stream: vi.fn<IModelAdapter['stream']>(),
    countTokens: vi.fn<IModelAdapter['countTokens']>().mockResolvedValue(10),
    validateConfig: () => ok(undefined),
  };
}

const servers: McpServer[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.restoreAllMocks();
});

function makeServer(): McpServer {
  const server = new McpServer({ name: 'workflow-availability', version: '1.0.0' });
  servers.push(server);
  return server;
}

async function connect(server: McpServer): Promise<Client> {
  const client = new Client({ name: 'availability-client', version: '1.0.0' });
  clients.push(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function register(
  server: McpServer,
  modelAdapter?: IModelAdapter
): ReturnType<typeof createLogger> {
  const logger = createLogger({ component: 'workflow-availability-test' });
  logger.setLevel('error');
  vi.spyOn(logger, 'warn');
  registerMcpTools({
    server,
    logger,
    builtInTemplates: new Map([[workflow.name, workflow]]),
    securityConfig: SecurityConfigSchema.parse({
      toolAllowlist: ['run_workflow', 'list_workflows'],
    }),
    ...(modelAdapter !== undefined && { modelAdapter }),
  });
  return logger;
}

describe('run_workflow startup availability over MCP (#7043)', () => {
  it('omits run_workflow when construction has no execution prerequisite', async () => {
    const server = makeServer();
    const logger = register(server);
    const client = await connect(server);

    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain('list_workflows');
    expect(names).not.toContain('run_workflow');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/run_workflow disabled:.*Configure a model adapter.*restart/),
      expect.objectContaining({ reason: expect.stringContaining('No expertFactory provided') })
    );
    const listing = await client.callTool({ name: 'list_workflows', arguments: {} });
    expect(listing.isError).not.toBe(true);
    expect(JSON.stringify(listing.content)).toContain(workflow.name);
    const run = await client.callTool({
      name: 'run_workflow',
      arguments: { template: workflow.name },
    });
    expect(run.isError).toBe(true);
  });

  it('lists and executes run_workflow with a startup adapter', async () => {
    const adapter = makeAdapter();
    const server = makeServer();
    register(server, adapter);
    const client = await connect(server);

    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('run_workflow');
    const result = CallToolResultSchema.parse(
      await client.callTool({
        name: 'run_workflow',
        arguments: { template: workflow.name, inputs: {} },
      })
    );
    expect(result.isError).not.toBe(true);
    const text = result.content.find((block) => block.type === 'text');
    expect(text?.type).toBe('text');
    if (text?.type !== 'text') throw new Error('Missing workflow result text');
    const parsed: unknown = JSON.parse(text.text);
    expect(parsed).toMatchObject({ status: 'completed' });
    expect(adapter.complete).toHaveBeenCalled();
  });

  it('does not hide unexpected resolver failures as structural unavailability', () => {
    const failure = new Error('unexpected configuration defect');
    expect(() => {
      registerRunWorkflowTool(makeServer(), {
        workflowEngine: createRealWorkflowEngine({ useMockExecutor: true }),
        resolveExecutionEngine: () => {
          throw failure;
        },
        rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100, refillIntervalMs: 1000 }),
      });
    }).toThrow(failure);
  });
});
