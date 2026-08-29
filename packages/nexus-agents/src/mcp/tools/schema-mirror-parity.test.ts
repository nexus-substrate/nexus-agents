/**
 * Every field a dispatch tool's handler accepts must be advertised in the
 * schema it registers (#4972 finding 3).
 *
 * Six tools register `SomeSchema.shape` and cannot drift. Four maintain a
 * separate object literal for `registerTool`, and a mirror is a second
 * declaration of one contract. `run_workflow`'s omitted `idempotencyKey` was
 * exactly that: the SDK stripped the field before the handler saw it, every
 * async dispatch minted a fresh jobId, and its `replay` / `collision`
 * envelopes could never fire — a whole feature unreachable, nothing red.
 *
 * ## Asserted at the protocol boundary, on KEYS only
 *
 * The comparison runs against what `listTools()` actually advertises, not
 * against a module-private constant. That is the surface the SDK filters
 * against, and it works whether a tool mirrors its schema or registers
 * `.shape`.
 *
 * Keys only, deliberately. The mirrors are not pure duplication — that is why
 * replacing them with `.shape` is not the fix. They carry richer caller-facing
 * text: the graph mirror says `Workflow name: echo, pipeline, code-review,
 * security-scan. Use "list" for available workflows.` where the internal
 * schema says `Name of the predefined graph workflow to execute`. Swapping in
 * `.shape` was tried and measured — it degrades six descriptions and newly
 * advertises internal defaults. Descriptions should be free to differ; the
 * field set must not.
 *
 * @module mcp/tools/schema-mirror-parity.test
 * (Source: Issue #4972)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer, connectTransport } from '../server.js';
import {
  registerTools,
  registerExecuteSpecTool,
  registerRunGraphWorkflowTool,
  registerRunWorkflowTool,
} from './index.js';
import { ExecuteSpecInputSchema } from './execute-spec-tool.js';
import { RunGraphWorkflowInputSchema } from './run-graph-workflow.js';
import { RunWorkflowInputSchema } from './run-workflow-types.js';
import type { IWorkflowEngine } from '../../core/index.js';

vi.mock('../../cli-adapters/factory.js', () => ({
  createCliAdapter: vi.fn(),
  createAllAdapters: vi.fn(() => new Map()),
  isCliAvailable: vi.fn().mockResolvedValue(false),
  getAvailableClis: vi.fn().mockResolvedValue([]),
}));

/** Internal schema each dispatch tool's handler parses its input with. */
const EXPECTED: Readonly<Record<string, Record<string, unknown>>> = {
  execute_spec: ExecuteSpecInputSchema.shape,
  run_graph_workflow: RunGraphWorkflowInputSchema.shape,
  run_workflow: RunWorkflowInputSchema.shape,
};

let advertised: Record<string, readonly string[]>;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const sr = createServer();
  if (!sr.ok) throw new Error(sr.error.message);
  const { server, logger } = sr.value;
  const infra = registerTools(server, { logger });
  const deps = { logger: infra.logger, rateLimiter: infra.rateLimiter };
  registerExecuteSpecTool(server, deps);
  registerRunGraphWorkflowTool(server, deps);
  registerRunWorkflowTool(server, {
    ...deps,
    workflowEngine: { listTemplates: () => Promise.resolve([]) } as unknown as IWorkflowEngine,
    resolveExecutionEngine: (): IWorkflowEngine =>
      ({ listTemplates: () => Promise.resolve([]) }) as unknown as IWorkflowEngine,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const connected = await connectTransport(server, serverTransport, logger);
  if (!connected.ok) throw new Error(connected.error.message);
  const client = new Client({ name: 'schema-parity', version: '1.0.0' });
  await client.connect(clientTransport);

  const listed = await client.listTools();
  advertised = Object.fromEntries(
    listed.tools.map((t) => [
      t.name,
      Object.keys(
        (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}
      ).sort(),
    ])
  );
  cleanup = async () => {
    await client.close();
    await server.close();
  };
});

afterAll(async () => {
  await cleanup();
});

describe('registered schemas advertise every field the handler accepts (#4972)', () => {
  it.each(Object.keys(EXPECTED))('%s', (tool) => {
    // A field present internally but absent from the registration is stripped
    // by the SDK before the handler runs — the `idempotencyKey` case.
    expect(advertised[tool]).toEqual(Object.keys(EXPECTED[tool] ?? {}).sort());
  });

  it('actually inspected each tool, rather than comparing two absent entries', () => {
    // `undefined === undefined` would pass every row above if a tool failed to
    // register. Naming the empty case is what makes those assertions mean
    // something.
    for (const tool of Object.keys(EXPECTED)) {
      expect(advertised[tool], `${tool} did not register`).toBeDefined();
      expect((advertised[tool] ?? []).length).toBeGreaterThan(0);
    }
  });
});
