/** #7151: standalone commands must publish endpoint arms before routing starts. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, type IModelAdapter } from './core/index.js';
import { FAKE_OPENAI_KEY } from './testing/test-secrets.js';

const entry = vi.hoisted(() => ({
  dispatch: vi.fn(),
  discover: vi.fn(),
}));
vi.mock('./cli-commands.js', () => ({
  dispatchCommand: entry.dispatch,
  printHelp: vi.fn(),
  printVersion: vi.fn(),
}));
vi.mock('./adapters/gateway-discovery.js', () => ({ discoverGatewayOnce: entry.discover }));
vi.mock('./cli-adapters/cli-binary-on-path.js', () => ({ isCliBinaryOnPath: () => false }));

const ARM = 'api:entry-test';
const model: IModelAdapter = {
  providerId: 'custom-openai',
  modelId: 'test-chat',
  capabilities: [],
  complete: vi.fn(),
  stream: vi.fn(),
  countTokens: vi.fn(),
  validateConfig: () => ok(undefined),
};

describe('standalone gateway routing through cli.ts (#7151)', () => {
  const originalArgv = process.argv;
  let dispatchedArms: string[] | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dispatchedArms = undefined;
    process.argv = [process.execPath, '/test/cli.ts', 'orchestrate', 'explain the parser'];
    vi.stubEnv('NEXUS_LOG_LEVEL', 'silent');
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'true');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'https://gateway.example/v1');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', FAKE_OPENAI_KEY);
    vi.stubEnv('NEXUS_OPENAI_COMPAT_ENDPOINT', 'entry-test');
    vi.stubEnv('NEXUS_GATEWAY_COST', 'free');
    vi.stubEnv('NEXUS_BILLING_MODE', 'plan');
    vi.stubEnv('NEXUS_SANDBOX', 'false');
    vi.stubEnv('NEXUS_DISABLED_CLIS', 'claude,codex,gemini,opencode');
    entry.discover.mockResolvedValue(ok([model]));
    entry.dispatch.mockImplementation(async () => {
      const { createAllAdapters } = await import('./cli-adapters/factory.js');
      dispatchedArms = [...createAllAdapters(undefined, 'subprocess').keys()];
    });
  });

  afterEach(async () => {
    const { resetGlobalRegistry } = await import('./adapters/unified-registry.js');
    resetGlobalRegistry();
    process.argv = originalArgv;
    vi.unstubAllEnvs();
  });

  async function runEntry(): Promise<void> {
    await import('./cli.js');
    await vi.waitFor(() => {
      expect(dispatchedArms).toBeDefined();
    });
  }

  it.each(['true', '1'])(
    'makes a declared endpoint available before orchestrate dispatch (%s)',
    async (flag) => {
      vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', flag);
      await runEntry();
      expect(dispatchedArms).toEqual([ARM]);
      expect(entry.discover).toHaveBeenCalledTimes(1);
      expect(entry.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'orchestrate' })
      );
    }
  );

  it('keeps standalone routing CLI-only without opt-in', async () => {
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'false');
    await runEntry();
    expect(dispatchedArms).toEqual([]);
    expect(entry.discover).not.toHaveBeenCalled();
  });

  it('skips opted-in gateway discovery before setup dry-run dispatch', async () => {
    process.argv = [process.execPath, '/test/cli.ts', 'setup', '--dry-run', '--non-interactive'];
    await runEntry();
    expect(entry.discover).not.toHaveBeenCalled();
    expect(dispatchedArms).toEqual([]);
    expect(entry.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'setup',
        options: expect.objectContaining({ dryRun: true }),
      })
    );
  });

  it.each(['server', 'help', 'version'])(
    'leaves %s bootstrap to its command handler',
    async (command) => {
      process.argv = [process.execPath, '/test/cli.ts', command];
      await runEntry();
      expect(entry.discover).not.toHaveBeenCalled();
    }
  );

  it('excludes an undeclared endpoint after standalone discovery', async () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
    await runEntry();
    expect(dispatchedArms).toEqual([]);
    expect(entry.discover).toHaveBeenCalledTimes(1);
  });
});
