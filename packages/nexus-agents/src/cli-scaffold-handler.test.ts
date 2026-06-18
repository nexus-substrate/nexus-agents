import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleScaffoldCommand } from './cli-scaffold-handler.js';
import type { ParsedCliArgs } from './cli-types.js';

vi.mock('./cli/index.js', () => ({
  scaffoldCommand: vi.fn(() => 0),
  isValidScaffoldType: vi.fn((t: string) => ['expert', 'workflow', 'adapter'].includes(t)),
  printScaffoldUsage: vi.fn(),
}));

function createArgs(positionals: string[], options: Record<string, unknown> = {}): ParsedCliArgs {
  const args = {
    positionals,
    options: { verbose: false, dryRun: false, force: false, ...options },
  } as unknown as ParsedCliArgs;
  return args;
}

describe('handleScaffoldCommand', () => {
  // #3942: the handler now RETURNS a CliExitResult instead of calling
  // process.exit; the dispatcher owns the exit. Assert the returned exitCode.
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call scaffoldCommand with valid type and name', async () => {
    const { scaffoldCommand } = await import('./cli/index.js');
    const result = handleScaffoldCommand(createArgs(['scaffold', 'expert', 'my-expert']));
    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(scaffoldCommand).toHaveBeenCalledWith({
      type: 'expert',
      name: 'my-expert',
      dryRun: false,
    });
  });

  it('should return SUCCESS when scaffoldCommand returns 0', () => {
    expect(handleScaffoldCommand(createArgs(['scaffold', 'expert', 'test']))).toEqual({
      success: true,
      exitCode: 0,
    });
  });

  it('should return SERVER_START_FAILED when scaffoldCommand returns non-zero', async () => {
    const { scaffoldCommand } = await import('./cli/index.js');
    vi.mocked(scaffoldCommand).mockReturnValue(1);
    expect(handleScaffoldCommand(createArgs(['scaffold', 'expert', 'test']))).toEqual({
      success: false,
      exitCode: 1,
    });
  });

  it('should print usage and return INVALID_ARGS when type is missing', async () => {
    const { printScaffoldUsage } = await import('./cli/index.js');
    expect(handleScaffoldCommand(createArgs(['scaffold']))).toEqual({
      success: false,
      exitCode: 3,
    });
    expect(printScaffoldUsage).toHaveBeenCalled();
  });

  it('should print usage and return INVALID_ARGS when name is missing', async () => {
    const { printScaffoldUsage } = await import('./cli/index.js');
    expect(handleScaffoldCommand(createArgs(['scaffold', 'expert']))).toEqual({
      success: false,
      exitCode: 3,
    });
    expect(printScaffoldUsage).toHaveBeenCalled();
  });

  it('should print usage and return INVALID_ARGS for invalid scaffold type', async () => {
    const { printScaffoldUsage } = await import('./cli/index.js');
    expect(handleScaffoldCommand(createArgs(['scaffold', 'invalid-type', 'name']))).toEqual({
      success: false,
      exitCode: 3,
    });
    expect(printScaffoldUsage).toHaveBeenCalled();
  });

  it('should pass dryRun option', async () => {
    const { scaffoldCommand } = await import('./cli/index.js');
    // clearAllMocks resets call history but not the implementation, so a prior
    // test's mockReturnValue(1) would leak; pin success for this assertion.
    vi.mocked(scaffoldCommand).mockReturnValue(0);
    const result = handleScaffoldCommand(
      createArgs(['scaffold', 'workflow', 'my-wf'], { dryRun: true })
    );
    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(scaffoldCommand).toHaveBeenCalledWith({
      type: 'workflow',
      name: 'my-wf',
      dryRun: true,
    });
  });
});
