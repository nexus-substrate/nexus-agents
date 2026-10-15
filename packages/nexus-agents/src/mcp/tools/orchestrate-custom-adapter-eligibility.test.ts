/** Public custom-adapter migration crosses the real registered handler and dispatcher (#7434). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryRegistry, setMemoryRegistry } from 'nexus-memory';
import { z } from 'zod';
import { registerOrchestrateTool, McpRateLimiter } from '../../exports/mcp.js';
import { getGlobalRegistry, resetGlobalRegistry } from '../../exports/adapters.js';
import type { IModelAdapter } from '../../exports/core.js';
import { createLogger, ok } from '../../core/index.js';
import { createMockOrchestrator } from './orchestrate-types.js';
import { shutdownToolMemory } from './tool-memory.js';
import { setSharedMobiMem } from '../../context/mobimem.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { resetOutcomeStore } from '../../orchestration/outcomes/index.js';

// No operator history influences this public-handler control.
vi.mock('../../config/learning-persistence.js', () => ({ isPersistenceEnabled: () => false }));
const task =
  'READ-ONLY review: Design and inspect a distributed authentication service: OAuth2 login, ' +
  'refresh-token rotation, per-tenant rate limiting, a tamper-evident audit log, a zero-downtime ' +
  'migration across three regions, integration tests for every failure mode, and a security ' +
  'review of the design. Do not implement or edit.';
const Body = z.object({
  workerDispatchStatus: z.string(),
  workerDispatch: z.object({
    totalWorkers: z.number(),
    successCount: z.number(),
    errorCount: z.number(),
    totalModelCalls: z.number(),
    unsupportedReason: z.string().optional(),
  }),
});
type Handler = (args: unknown) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}>;
let ownedDirectory = '';
beforeEach(() => {
  ownedDirectory = mkdtempSync(join(tmpdir(), 'custom-adapter-eligibility-'));
  const configPath = join(ownedDirectory, 'nexus-agents.yaml');
  writeFileSync(configPath, '{}\n');
  vi.stubEnv('NEXUS_DATA_DIR', ownedDirectory);
  vi.stubEnv('NEXUS_CONFIG_PATH', configPath);
  vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', join(ownedDirectory, 'vote-records.jsonl'));
  vi.stubEnv('NEXUS_NO_SCAFFOLD', '1');
  vi.stubEnv('NEXUS_AORCHESTRA', '1');
  vi.stubEnv('NEXUS_AORCHESTRA_DISPATCH', 'true');
  resetNexusDataDirCache();
  resetOutcomeStore();
  // The registry owns no SQLite connection; ToolMemory owns any attached backends.
  setMemoryRegistry(new MemoryRegistry());
});
afterEach(() => {
  // End the owned session and stop its decay timers before restoring environment/paths.
  shutdownToolMemory();
  setSharedMobiMem(null);
  setMemoryRegistry(null);
  resetOutcomeStore();
  vi.restoreAllMocks();
  resetGlobalRegistry();
  vi.unstubAllEnvs();
  resetNexusDataDirCache();
  if (ownedDirectory !== '') rmSync(ownedDirectory, { recursive: true, force: true });
  ownedDirectory = '';
});

function contentOnlyAdapter(): IModelAdapter {
  return {
    providerId: 'TEST-content-only',
    modelId: 'gpt-4o-2024-11-20',
    capabilities: ['completion'],
    complete: vi.fn().mockResolvedValue(
      ok({
        content: [
          {
            type: 'text',
            text: 'TEST source review: inspect the authentication boundary and integration tests. No host tools or provider calls occur in this content-only fixture. '.repeat(
              8
            ),
          },
        ],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        stopReason: 'end_turn',
        model: 'gpt-4o-2024-11-20',
      })
    ),
    stream: vi.fn(),
    countTokens: () => Promise.resolve(100),
    validateConfig: () => ok(undefined),
  };
}
function registeredHandler(adapter: IModelAdapter): Handler {
  // Real role routing sees only this same custom adapter, never an invented compatible fallback.
  const registry = getGlobalRegistry();
  vi.spyOn(registry, 'getAdapterForCli').mockReturnValue(
    adapter as unknown as ReturnType<typeof registry.getAdapterForCli>
  );
  let handler: Handler | undefined;
  registerOrchestrateTool(
    {
      registerTool(_name: string, _schema: unknown, callback: Handler): void {
        handler = callback;
      },
    } as never,
    {
      modelAdapter: adapter,
      orchestrator: createMockOrchestrator(),
      rateLimiter: new McpRateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 }),
      logger: createLogger({ component: 'custom-adapter-migration-test' }),
      notifier: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    }
  );
  if (handler === undefined) throw new Error('Public handler was not registered');
  return handler;
}
async function dispatch(adapter: IModelAdapter): Promise<{
  isError: boolean;
  body: z.infer<typeof Body>;
}> {
  const response = await registeredHandler(adapter)({ task, maxIterations: 1, timeout: 10000 });
  const text = response.content.find((item) => item.type === 'text')?.text;
  if (text === undefined) throw new Error('Public handler returned no text');
  return { isError: response.isError === true, body: Body.parse(JSON.parse(text)) };
}

describe('public custom adapter worker eligibility migration', () => {
  it('reports unknown support as UNSUPPORTED with zero completion attempts', async () => {
    const adapter = contentOnlyAdapter();
    expect(adapter.supportsAccessMode).toBeUndefined();
    const { isError, body } = await dispatch(adapter);
    expect(isError).toBe(true);
    expect(body.workerDispatchStatus).toBe('failed');
    expect(body.workerDispatch.totalWorkers).toBe(2);
    expect(body.workerDispatch.successCount).toBe(0);
    expect(body.workerDispatch.errorCount).toBe(2);
    expect(body.workerDispatch.totalModelCalls).toBe(0);
    expect(body.workerDispatch.unsupportedReason).toMatch(/unknown=1/);
    expect(adapter.complete).not.toHaveBeenCalled();
  });

  it('dispatches after forwarding evidence from the actual content-only transport', async () => {
    const adapter = contentOnlyAdapter();
    // This fixture executes only the controlled content response above, never host tools.
    const transportQuery = vi.fn<NonNullable<IModelAdapter['supportsAccessMode']>>(() =>
      Promise.resolve(true)
    );
    adapter.supportsAccessMode = (mode, signal) => transportQuery(mode, signal);
    const { isError, body } = await dispatch(adapter);
    expect(isError).toBe(false);
    expect(body.workerDispatchStatus).toBe('success');
    expect(body.workerDispatch.totalWorkers).toBe(2);
    expect(body.workerDispatch.successCount).toBe(2);
    expect(body.workerDispatch.errorCount).toBe(0);
    expect(body.workerDispatch.totalModelCalls).toBe(2);
    expect(adapter.complete).toHaveBeenCalledTimes(2);
    expect(transportQuery).toHaveBeenCalledWith('read-only-analysis', undefined);
  });
});
