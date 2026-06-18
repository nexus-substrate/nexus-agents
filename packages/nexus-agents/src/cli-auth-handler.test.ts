import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleAuthCommand } from './cli-auth-handler.js';
import type { ParsedCliArgs } from './cli-types.js';

vi.mock('./cli/index.js', () => ({
  // #3942: authCommand now returns success boolean; default to success.
  authCommand: vi.fn(() => true),
}));

vi.mock('./cli/login-command.js', () => ({
  // #3942: handleLoginCommand now resolves a CliExitResult.
  handleLoginCommand: vi.fn(() => Promise.resolve({ success: true, exitCode: 0 })),
}));

function createArgs(
  subcommand: string | undefined,
  options: Record<string, unknown> = {}
): ParsedCliArgs {
  const args = {
    positionals: ['auth'],
    subcommand,
    options: { verbose: false, dryRun: false, force: false, format: 'text', ...options },
  } as unknown as ParsedCliArgs;
  return args;
}

describe('handleAuthCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call authCommand with subcommand', async () => {
    const { authCommand } = await import('./cli/index.js');
    await handleAuthCommand(createArgs('init'));
    expect(authCommand).toHaveBeenCalledWith('init', { force: false, format: 'text' });
  });

  it('should pass force option', async () => {
    const { authCommand } = await import('./cli/index.js');
    await handleAuthCommand(createArgs('rotate', { force: true }));
    expect(authCommand).toHaveBeenCalledWith('rotate', { force: true, format: 'text' });
  });

  it('should pass json format', async () => {
    const { authCommand } = await import('./cli/index.js');
    await handleAuthCommand(createArgs('show', { format: 'json' }));
    expect(authCommand).toHaveBeenCalledWith('show', { force: false, format: 'json' });
  });

  it('should default format to text for non-json values', async () => {
    const { authCommand } = await import('./cli/index.js');
    await handleAuthCommand(createArgs('show', { format: 'yaml' }));
    expect(authCommand).toHaveBeenCalledWith('show', { force: false, format: 'text' });
  });

  it('should pass undefined subcommand', async () => {
    const { authCommand } = await import('./cli/index.js');
    await handleAuthCommand(createArgs(undefined));
    expect(authCommand).toHaveBeenCalledWith(undefined, { force: false, format: 'text' });
  });

  // Issue #2449: `auth status` routes to the shared login-command probe.
  it('routes "auth status" subcommand to handleLoginCommand', async () => {
    const { authCommand } = await import('./cli/index.js');
    const { handleLoginCommand } = await import('./cli/login-command.js');
    await handleAuthCommand(createArgs('status'));
    expect(handleLoginCommand).toHaveBeenCalledOnce();
    // The legacy auth-token handler must NOT fire for "status".
    expect(authCommand).not.toHaveBeenCalled();
  });

  it('does NOT route "init"/"show"/"rotate" through handleLoginCommand', async () => {
    const { handleLoginCommand } = await import('./cli/login-command.js');
    await handleAuthCommand(createArgs('init'));
    await handleAuthCommand(createArgs('show'));
    await handleAuthCommand(createArgs('rotate'));
    expect(handleLoginCommand).not.toHaveBeenCalled();
  });
});
