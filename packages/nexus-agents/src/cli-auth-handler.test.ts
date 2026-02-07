import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleAuthCommand } from './cli-auth-handler.js';
import type { ParsedCliArgs } from './cli-types.js';

vi.mock('./cli/index.js', () => ({
  authCommand: vi.fn(),
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
    handleAuthCommand(createArgs('init'));
    expect(authCommand).toHaveBeenCalledWith('init', { force: false, format: 'text' });
  });

  it('should pass force option', async () => {
    const { authCommand } = await import('./cli/index.js');
    handleAuthCommand(createArgs('rotate', { force: true }));
    expect(authCommand).toHaveBeenCalledWith('rotate', { force: true, format: 'text' });
  });

  it('should pass json format', async () => {
    const { authCommand } = await import('./cli/index.js');
    handleAuthCommand(createArgs('show', { format: 'json' }));
    expect(authCommand).toHaveBeenCalledWith('show', { force: false, format: 'json' });
  });

  it('should default format to text for non-json values', async () => {
    const { authCommand } = await import('./cli/index.js');
    handleAuthCommand(createArgs('show', { format: 'yaml' }));
    expect(authCommand).toHaveBeenCalledWith('show', { force: false, format: 'text' });
  });

  it('should pass undefined subcommand', async () => {
    const { authCommand } = await import('./cli/index.js');
    handleAuthCommand(createArgs(undefined));
    expect(authCommand).toHaveBeenCalledWith(undefined, { force: false, format: 'text' });
  });
});
