import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../cli.js';
import { dispatchCommand } from '../cli-commands.js';
import { EXIT_CODES } from '../cli-types.js';
import { setupCommandAsync } from './index.js';
import { configureCustomApi } from './setup-custom-api.js';

// Keep parsing, option building, dispatch and setup handlers real. Stub setup
// work so this seam neither probes a gateway nor runs an interactive wizard.
vi.mock('./index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index.js')>()),
  setupCommandAsync: vi.fn(() => Promise.resolve(0)),
}));

vi.mock('./setup-custom-api.js', () => ({ configureCustomApi: vi.fn() }));

describe('setup custom API parse → build → dispatch seam (#5129)', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`setup exit ${String(code)}`);
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.mocked(configureCustomApi).mockResolvedValue({
      ok: true,
      value: {
        baseUrl: 'https://gateway.example/v1',
        model: 'test-model',
        probeSucceeded: true,
        shellFragment: 'export TEST_GATEWAY=1\n',
      },
    });
  });

  it('dispatches all custom flags to custom setup instead of the wizard', async () => {
    const args = parseCliArgs([
      'setup',
      '--custom-api',
      'https://gateway.example/v1',
      '--custom-api-key',
      'TEST_FAKE_API_KEY',
      '--custom-model',
      'test-model',
      '--non-interactive',
    ]);

    await expect(dispatchCommand(args)).rejects.toThrow('setup exit 0');

    expect(configureCustomApi).toHaveBeenCalledExactlyOnceWith({
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'TEST_FAKE_API_KEY',
      model: 'test-model',
      nonInteractive: true,
    });
    expect(setupCommandAsync).not.toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledWith('export TEST_GATEWAY=1\n');
    expect(process.exit).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });

  it('dispatches a URL alone without adding absent key or model properties', async () => {
    const args = parseCliArgs(['setup', '--custom-api', 'https://gateway.example/v1']);

    await expect(dispatchCommand(args)).rejects.toThrow('setup exit 0');

    expect(configureCustomApi).toHaveBeenCalledExactlyOnceWith({
      baseUrl: 'https://gateway.example/v1',
      nonInteractive: false,
    });
    expect(setupCommandAsync).not.toHaveBeenCalled();
  });

  it('propagates a custom setup error without falling back to the wizard', async () => {
    vi.mocked(configureCustomApi).mockResolvedValueOnce({
      ok: false,
      error: new Error('test gateway unavailable'),
    });
    const args = parseCliArgs(['setup', '--custom-api', 'https://gateway.example/v1']);

    await expect(dispatchCommand(args)).rejects.toThrow(
      `setup exit ${String(EXIT_CODES.SERVER_START_FAILED)}`
    );

    expect(process.stderr.write).toHaveBeenCalledWith('✗ test gateway unavailable\n');
    expect(setupCommandAsync).not.toHaveBeenCalled();
  });

  it('dispatches setup without a custom URL to the normal wizard', async () => {
    const args = parseCliArgs(['setup', '--non-interactive', '--scope', 'project']);

    await expect(dispatchCommand(args)).rejects.toThrow('setup exit 0');

    expect(setupCommandAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ nonInteractive: true, scope: 'project' })
    );
    expect(configureCustomApi).not.toHaveBeenCalled();
  });
});
