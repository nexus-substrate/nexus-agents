import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { dispatchCommand, printHelp, printVersion } from './cli-commands.js';
import type { ParsedCliArgs } from './cli-types.js';

// Mock all handler modules
vi.mock('./cli-commands-handlers.js', () => ({
  handleUnimplementedCommand: vi.fn(),
  handleConfigCommand: vi.fn(() => Promise.resolve()),
  handleExpertCommand: vi.fn(),
  handleWorkflowCommand: vi.fn(() => Promise.resolve()),
  handleServerCommand: vi.fn(() => Promise.resolve()),
  handleReviewCommand: vi.fn(() => Promise.resolve()),
  handleRoutingAuditCommand: vi.fn(),
  handleOrchestrateCommand: vi.fn(() => Promise.resolve()),
  handleSystemReviewCommand: vi.fn(),
  handleVoteCommand: vi.fn(() => Promise.resolve()),
  handleIndexCommand: vi.fn(() => Promise.resolve()),
  handleResearchCommand: vi.fn(() => Promise.resolve()),
  handleValidationCommand: vi.fn(),
  handleLearningMetricsCommand: vi.fn(),
  handleSweBenchCommand: vi.fn(() => Promise.resolve()),
  handleVerifyCommand: vi.fn(() => Promise.resolve()),
  handleDoctorCommand: vi.fn(() => Promise.resolve()),
  handleSetupCommand: vi.fn(),
  handleSetupCommandAsync: vi.fn(() => Promise.resolve()),
  handleHelloCommand: vi.fn(),
  handleHooksCommand: vi.fn(() => Promise.resolve()),
  handleDemoCommand: vi.fn(() => Promise.resolve()),
  handleSprintCommand: vi.fn(() => Promise.resolve()),
  handleSessionCommand: vi.fn(() => Promise.resolve()),
  handleEvaluateCommand: vi.fn(() => Promise.resolve()),
  handleIssueCommand: vi.fn(),
  handleFitnessAuditCommand: vi.fn(),
  handleWarmUpCommand: vi.fn(),
  handleE2EEvalCommand: vi.fn(),
  handleRoutingABCommand: vi.fn(),
  handleMemoryEvalCommand: vi.fn(),
}));

vi.mock('./cli-auth-handler.js', () => ({
  handleAuthCommand: vi.fn(),
}));

vi.mock('./cli-release-handlers.js', () => ({
  handleReleaseNotesCommand: vi.fn(() => Promise.resolve()),
  handleReleaseValidateCommand: vi.fn(() => Promise.resolve()),
  handleReleaseAnnounceCommand: vi.fn(() => Promise.resolve()),
}));

vi.mock('./cli-scaffold-handler.js', () => ({
  handleScaffoldCommand: vi.fn(),
}));

vi.mock('./cli/visualize-command.js', () => ({
  handleVisualizeCommand: vi.fn(),
}));

vi.mock('./cli/capabilities-command.js', () => ({
  handleCapabilitiesCommand: vi.fn(),
}));

vi.mock('./cli/status-command.js', () => ({
  handleStatusCommand: vi.fn(),
}));

vi.mock('./cli/memory-benchmark-command.js', () => ({
  handleMemoryBenchmarkCommand: vi.fn(() => Promise.resolve()),
}));

function createArgs(command: string, overrides: Record<string, unknown> = {}): ParsedCliArgs {
  const args = {
    positionals: [command],
    command,
    options: { verbose: false, dryRun: false, force: false, format: 'text' },
    ...overrides,
  } as unknown as ParsedCliArgs;
  return args;
}

describe('cli-commands', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  // Vitest 3.x intercepts process.exit before spies fire.
  // Assertions use substring/regex matching on vitest's error message.
  vi.spyOn(process, 'exit');

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true) as unknown as ReturnType<
      typeof vi.spyOn
    >;
  });

  afterEach(() => {
    vi.clearAllMocks();
    writeSpy.mockRestore();
  });

  describe('printHelp', () => {
    it('should write help text to stdout', () => {
      printHelp();
      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('nexus-agents');
    });
  });

  describe('printVersion', () => {
    it('should write version to stdout', () => {
      printVersion();
      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('nexus-agents v');
    });
  });

  describe('dispatchCommand', () => {
    it('should dispatch help command', async () => {
      await expect(dispatchCommand(createArgs('help'))).rejects.toThrow('process.exit');
    });

    it('should dispatch version command', async () => {
      await expect(dispatchCommand(createArgs('version'))).rejects.toThrow('process.exit');
    });

    it('should dispatch sync commands', async () => {
      const { handleHelloCommand } = await import('./cli-commands-handlers.js');
      await dispatchCommand(createArgs('hello'));
      expect(handleHelloCommand).toHaveBeenCalled();
    });

    it('should dispatch expert command (sync)', async () => {
      const { handleExpertCommand } = await import('./cli-commands-handlers.js');
      await dispatchCommand(createArgs('expert'));
      expect(handleExpertCommand).toHaveBeenCalled();
    });

    it('should dispatch auth command (sync)', async () => {
      const { handleAuthCommand } = await import('./cli-auth-handler.js');
      await dispatchCommand(createArgs('auth'));
      expect(handleAuthCommand).toHaveBeenCalled();
    });

    it('should dispatch scaffold command (sync)', async () => {
      const { handleScaffoldCommand } = await import('./cli-scaffold-handler.js');
      await dispatchCommand(createArgs('scaffold'));
      expect(handleScaffoldCommand).toHaveBeenCalled();
    });

    it('should dispatch async commands', async () => {
      const { handleServerCommand } = await import('./cli-commands-handlers.js');
      await dispatchCommand(createArgs('server'));
      expect(handleServerCommand).toHaveBeenCalled();
    });

    it('should dispatch config command (async)', async () => {
      const { handleConfigCommand } = await import('./cli-commands-handlers.js');
      await dispatchCommand(createArgs('config'));
      expect(handleConfigCommand).toHaveBeenCalled();
    });

    it('should dispatch orchestrate command (async)', async () => {
      const { handleOrchestrateCommand } = await import('./cli-commands-handlers.js');
      await dispatchCommand(createArgs('orchestrate'));
      expect(handleOrchestrateCommand).toHaveBeenCalled();
    });

    it('should dispatch vote command (async)', async () => {
      const { handleVoteCommand } = await import('./cli-commands-handlers.js');
      await dispatchCommand(createArgs('vote'));
      expect(handleVoteCommand).toHaveBeenCalled();
    });

    it('should dispatch release-notes command (async)', async () => {
      const { handleReleaseNotesCommand } = await import('./cli-release-handlers.js');
      await dispatchCommand(createArgs('release-notes'));
      expect(handleReleaseNotesCommand).toHaveBeenCalled();
    });

    it('should dispatch swe-bench command (async)', async () => {
      const { handleSweBenchCommand } = await import('./cli-commands-handlers.js');
      await dispatchCommand(createArgs('swe-bench'));
      expect(handleSweBenchCommand).toHaveBeenCalled();
    });

    it('should dispatch fitness-audit command (sync)', async () => {
      const { handleFitnessAuditCommand } = await import('./cli-commands-handlers.js');
      await dispatchCommand(createArgs('fitness-audit'));
      expect(handleFitnessAuditCommand).toHaveBeenCalled();
    });

    it('should not throw for unknown command', async () => {
      await expect(dispatchCommand(createArgs('nonexistent'))).resolves.toBeUndefined();
    });

    it('should pass args to handler', async () => {
      const { handleDoctorCommand } = await import('./cli-commands-handlers.js');
      const args = createArgs('doctor', { options: { verbose: true } });
      await dispatchCommand(args);
      expect(handleDoctorCommand).toHaveBeenCalledWith(args);
    });
  });
});
