import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from 'vitest';
import { dispatchCommand, printHelp, printVersion } from './cli-commands.js';
import { LIFECYCLE_DELEGATED, type ParsedCliArgs } from './cli-types.js';

// #3942: every handler now returns a CliHandlerResult (CliExitResult |
// LifecycleDelegated) — never void/undefined. The dispatcher's `exitWith`
// calls `process.exit` for a CliExitResult and no-ops for LIFECYCLE_DELEGATED.
// These dispatch-routing tests only assert the handler was invoked, so the
// mocks return the LIFECYCLE_DELEGATED sentinel to keep `dispatchCommand`
// resolving (no forced exit) — the old no-op-on-undefined behavior, now typed.
// `vi.hoisted` is required because `vi.mock` factories are hoisted above the
// module body, so the helpers must be hoisted alongside them.
const { DELEGATED, DELEGATED_ASYNC } = vi.hoisted(() => {
  const sentinel = { __lifecycleDelegated: true } as const;
  return {
    DELEGATED: (): typeof sentinel => sentinel,
    DELEGATED_ASYNC: (): Promise<typeof sentinel> => Promise.resolve(sentinel),
  };
});

// Mock all handler modules
vi.mock('./cli-commands-handlers.js', () => ({
  handleUnimplementedCommand: vi.fn(DELEGATED),
  handleConfigCommand: vi.fn(DELEGATED_ASYNC),
  handleExpertCommand: vi.fn(DELEGATED),
  handleWorkflowCommand: vi.fn(DELEGATED_ASYNC),
  handleServerCommand: vi.fn(DELEGATED_ASYNC),
  handleReviewCommand: vi.fn(DELEGATED_ASYNC),
  handleRoutingAuditCommand: vi.fn(DELEGATED),
  handleOrchestrateCommand: vi.fn(DELEGATED_ASYNC),
  handleSystemReviewCommand: vi.fn(DELEGATED),
  handleVoteCommand: vi.fn(DELEGATED_ASYNC),
  handleIndexCommand: vi.fn(DELEGATED_ASYNC),
  handleResearchCommand: vi.fn(DELEGATED_ASYNC),
  handleRegistryCommand: vi.fn(DELEGATED_ASYNC),
  handleValidationCommand: vi.fn(DELEGATED),
  handleLearningMetricsCommand: vi.fn(DELEGATED),
  handleSweBenchCommand: vi.fn(DELEGATED_ASYNC),
  handleAtbenchCommand: vi.fn(DELEGATED_ASYNC),
  handleVerifyCommand: vi.fn(DELEGATED_ASYNC),
  handleDoctorCommand: vi.fn(DELEGATED_ASYNC),
  handleSetupCommand: vi.fn(DELEGATED),
  handleSetupCommandAsync: vi.fn(DELEGATED_ASYNC),
  handleHelloCommand: vi.fn(DELEGATED),
  handleHooksCommand: vi.fn(DELEGATED_ASYNC),
  handleDemoCommand: vi.fn(DELEGATED_ASYNC),
  handleTourCommand: vi.fn(DELEGATED_ASYNC),
  handleSprintCommand: vi.fn(DELEGATED_ASYNC),
  handleSessionCommand: vi.fn(DELEGATED_ASYNC),
  handleEvaluateCommand: vi.fn(DELEGATED_ASYNC),
  handleIssueCommand: vi.fn(DELEGATED),
  handleFitnessAuditCommand: vi.fn(DELEGATED),
  handleWarmUpCommand: vi.fn(DELEGATED),
  handleE2EEvalCommand: vi.fn(DELEGATED),
  handleRoutingABCommand: vi.fn(DELEGATED),
  handleMemoryEvalCommand: vi.fn(DELEGATED),
  handleInitCommand: vi.fn(DELEGATED_ASYNC),
}));

vi.mock('./cli-auth-handler.js', () => ({
  handleAuthCommand: vi.fn(DELEGATED_ASYNC),
}));

vi.mock('./cli-release-handlers.js', () => ({
  handleReleaseNotesCommand: vi.fn(DELEGATED_ASYNC),
  handleReleaseValidateCommand: vi.fn(DELEGATED_ASYNC),
  handleReleaseAnnounceCommand: vi.fn(DELEGATED_ASYNC),
}));

vi.mock('./cli-scaffold-handler.js', () => ({
  handleScaffoldCommand: vi.fn(DELEGATED),
}));

vi.mock('./cli/visualize-command.js', () => ({
  handleVisualizeCommand: vi.fn(DELEGATED_ASYNC),
}));

vi.mock('./cli/capabilities-command.js', () => ({
  handleCapabilitiesCommand: vi.fn(DELEGATED),
}));

vi.mock('./cli/status-command.js', () => ({
  handleStatusCommand: vi.fn(DELEGATED),
}));

vi.mock('./cli/memory-benchmark-command.js', () => ({
  handleMemoryBenchmarkCommand: vi.fn(DELEGATED_ASYNC),
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
  let writeSpy: MockInstance;
  // Vitest 3.x intercepts process.exit before spies fire.
  // Assertions use substring/regex matching on vitest's error message.
  vi.spyOn(process, 'exit');

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    writeSpy.mockRestore();
  });

  describe('printHelp', () => {
    it('should write help text to stdout', () => {
      printHelp();
      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('nexus-agents');
    });
  });

  describe('printVersion', () => {
    it('should write version to stdout', () => {
      printVersion();
      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
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

    // #3210: the dispatcher is the single process.exit boundary. A handler
    // that RETURNS a CliExitResult must map to process.exit(result.exitCode);
    // a handler that returns the LIFECYCLE_DELEGATED sentinel must NOT force
    // an exit (#3942 — the sentinel replaces the old bare-undefined signal).
    it('maps a returned CliExitResult to process.exit (sync handler)', async () => {
      const { handleExpertCommand } = await import('./cli-commands-handlers.js');
      vi.mocked(handleExpertCommand).mockReturnValueOnce({ success: false, exitCode: 4 });
      // Vitest turns process.exit into a throw; assert the code via the message.
      await expect(dispatchCommand(createArgs('expert'))).rejects.toThrow(/process\.exit.*4|4/);
    });

    it('maps a returned CliExitResult to process.exit (async handler)', async () => {
      const { handleVoteCommand } = await import('./cli-commands-handlers.js');
      vi.mocked(handleVoteCommand).mockResolvedValueOnce({ success: true, exitCode: 0 });
      await expect(dispatchCommand(createArgs('vote'))).rejects.toThrow(/process\.exit/);
    });

    // #3942: lifecycle-owning handlers RETURN the explicit LIFECYCLE_DELEGATED
    // sentinel instead of a bare undefined. exitWith must no-op on it so the
    // handler keeps ownership of the process (e.g. the MCP stdio server).
    it('does NOT call process.exit when a handler returns LIFECYCLE_DELEGATED', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      const { handleServerCommand } = await import('./cli-commands-handlers.js');
      vi.mocked(handleServerCommand).mockResolvedValueOnce(LIFECYCLE_DELEGATED);
      await dispatchCommand(createArgs('server'));
      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });

    it('should pass args to handler', async () => {
      const { handleDoctorCommand } = await import('./cli-commands-handlers.js');
      const args = createArgs('doctor', { options: { verbose: true } });
      await dispatchCommand(args);
      expect(handleDoctorCommand).toHaveBeenCalledWith(args);
    });
  });
});
