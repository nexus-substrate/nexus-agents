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
  // Vitest 3.x intercepts process.exit before spies fire, so we verify
  // exit codes via the thrown error message format:
  // "process.exit unexpectedly called with \"N\""
  vi.spyOn(process, 'exit');

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call scaffoldCommand with valid type and name', async () => {
    const { scaffoldCommand } = await import('./cli/index.js');
    expect(() => {
      handleScaffoldCommand(createArgs(['scaffold', 'expert', 'my-expert']));
    }).toThrow('process.exit');
    expect(scaffoldCommand).toHaveBeenCalledWith({
      type: 'expert',
      name: 'my-expert',
      dryRun: false,
    });
  });

  it('should exit SUCCESS when scaffoldCommand returns 0', () => {
    expect(() => {
      handleScaffoldCommand(createArgs(['scaffold', 'expert', 'test']));
    }).toThrow(/process\.exit.*"0"/);
  });

  it('should exit SERVER_START_FAILED when scaffoldCommand returns non-zero', async () => {
    const { scaffoldCommand } = await import('./cli/index.js');
    vi.mocked(scaffoldCommand).mockReturnValue(1);
    expect(() => {
      handleScaffoldCommand(createArgs(['scaffold', 'expert', 'test']));
    }).toThrow(/process\.exit.*"1"/);
  });

  it('should print usage and exit when type is missing', async () => {
    const { printScaffoldUsage } = await import('./cli/index.js');
    expect(() => {
      handleScaffoldCommand(createArgs(['scaffold']));
    }).toThrow(/process\.exit.*"3"/);
    expect(printScaffoldUsage).toHaveBeenCalled();
  });

  it('should print usage and exit when name is missing', async () => {
    const { printScaffoldUsage } = await import('./cli/index.js');
    expect(() => {
      handleScaffoldCommand(createArgs(['scaffold', 'expert']));
    }).toThrow(/process\.exit.*"3"/);
    expect(printScaffoldUsage).toHaveBeenCalled();
  });

  it('should print usage and exit for invalid scaffold type', async () => {
    const { printScaffoldUsage } = await import('./cli/index.js');
    expect(() => {
      handleScaffoldCommand(createArgs(['scaffold', 'invalid-type', 'name']));
    }).toThrow(/process\.exit.*"3"/);
    expect(printScaffoldUsage).toHaveBeenCalled();
  });

  it('should pass dryRun option', async () => {
    const { scaffoldCommand } = await import('./cli/index.js');
    expect(() => {
      handleScaffoldCommand(createArgs(['scaffold', 'workflow', 'my-wf'], { dryRun: true }));
    }).toThrow('process.exit');
    expect(scaffoldCommand).toHaveBeenCalledWith({
      type: 'workflow',
      name: 'my-wf',
      dryRun: true,
    });
  });
});
