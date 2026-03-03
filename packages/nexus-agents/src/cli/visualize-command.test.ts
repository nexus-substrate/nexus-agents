/**
 * nexus-agents/cli - Visualize Command Tests
 *
 * Tests for the visualize command handler: subcommand dispatch,
 * output formatting, file writing, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { ParsedCliArgs } from '../cli-types.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../utils/visual-output.js', () => ({
  generateArchitectureDiagram: vi.fn(() => 'graph TB\n  A-->B'),
  generateSwarmVisualization: vi.fn(() => 'graph LR\n  lead-->dev'),
  generateFlowDiagram: vi.fn(() => 'graph TD\n  start-->end'),
  generateOrchestrationSequence: vi.fn(() => 'sequenceDiagram\n  O->>A: Do'),
  generateAsciiDashboard: vi.fn(() => '╔══════╗\n║DASH  ║\n╚══════╝'),
  generateSystemSummary: vi.fn(() => '╔══════╗\n║SUMMARY║\n╚══════╝'),
  wrapInMarkdownFence: vi.fn(
    (diagram: string, title: string) => `## ${title}\n\n\`\`\`mermaid\n${diagram}\n\`\`\``
  ),
}));

vi.mock('./visualize-summary.js', () => ({
  gatherSystemSummary: vi.fn(() => ({
    version: '2.0.0',
    sourceFiles: 100,
    testFiles: 50,
    testCount: 1500,
    mcpTools: 8,
    expertTypes: 6,
    workflowTemplates: 3,
    fitnessScore: 97,
    cliCommands: 30,
    adapters: 3,
    layers: [{ name: 'Core', files: 10 }],
  })),
}));

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeArgs(positionals: string[], options: Record<string, string | undefined> = {}) {
  return {
    command: 'visualize' as const,
    positionals,
    options: {
      help: false,
      version: false,
      verbose: false,
      interactive: false,
      mode: 'server',
      force: false,
      format: 'table',
      dryRun: false,
      banditStats: false,
      setup: false,
      skipChecks: false,
      createIssue: false,
      fix: false,
      quick: false,
      resume: false,
      nonInteractive: false,
      skipMcp: false,
      skipRules: false,
      skipHooks: false,
      mock: false,
      ...options,
    },
  } as unknown as ParsedCliArgs;
}

// ============================================================================
// Tests
// ============================================================================

describe('handleVisualizeCommand', () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;
  let exitSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  // ==========================================================================
  // Subcommand validation
  // ==========================================================================

  describe('subcommand validation', () => {
    it('should show usage and exit 0 when no subcommand is provided', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');

      expect(() => {
        handleVisualizeCommand(makeArgs(['visualize']));
      }).toThrow('process.exit called');

      expect(exitSpy).toHaveBeenCalledWith(0);
      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('SUBCOMMANDS');
    });

    it('should show usage and exit 3 for invalid subcommand', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');

      expect(() => {
        handleVisualizeCommand(makeArgs(['visualize', 'invalid']));
      }).toThrow('process.exit called');

      expect(exitSpy).toHaveBeenCalledWith(3);
    });

    it('should show usage text containing all valid subcommands', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');

      expect(() => {
        handleVisualizeCommand(makeArgs(['visualize']));
      }).toThrow('process.exit called');

      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('architecture');
      expect(output).toContain('swarm');
      expect(output).toContain('orchestration');
      expect(output).toContain('flow');
      expect(output).toContain('summary');
    });

    it('should show usage containing format and output options', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');

      expect(() => {
        handleVisualizeCommand(makeArgs(['visualize']));
      }).toThrow('process.exit called');

      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('--format');
      expect(output).toContain('--output');
    });
  });

  // ==========================================================================
  // Architecture subcommand
  // ==========================================================================

  describe('architecture subcommand', () => {
    it('should generate architecture diagram with default mermaid format', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { generateArchitectureDiagram } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'architecture']));

      expect(generateArchitectureDiagram).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('graph TB');
    });

    it('should wrap in markdown fence when format is markdown', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { wrapInMarkdownFence } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'architecture'], { format: 'markdown' }));

      expect(wrapInMarkdownFence).toHaveBeenCalledWith(
        'graph TB\n  A-->B',
        'Nexus Agents Architecture'
      );
    });
  });

  // ==========================================================================
  // Swarm subcommand
  // ==========================================================================

  describe('swarm subcommand', () => {
    it('should generate swarm visualization', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { generateSwarmVisualization } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'swarm']));

      expect(generateSwarmVisualization).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('graph LR');
    });

    it('should pass 7 agents to the swarm visualization', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { generateSwarmVisualization } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'swarm']));

      const call = vi.mocked(generateSwarmVisualization).mock.calls[0]!;
      expect(call).toBeDefined();
      expect(call[0]).toHaveLength(7);
    });
  });

  // ==========================================================================
  // Orchestration subcommand
  // ==========================================================================

  describe('orchestration subcommand', () => {
    it('should generate sequence diagram with default format', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { generateOrchestrationSequence } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'orchestration']));

      expect(generateOrchestrationSequence).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('sequenceDiagram');
    });

    it('should generate ASCII dashboard when format is ascii', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { generateAsciiDashboard } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'orchestration'], { format: 'ascii' }));

      expect(generateAsciiDashboard).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('DASH');
    });

    it('should wrap orchestration in markdown fence when format is markdown', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { wrapInMarkdownFence } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'orchestration'], { format: 'markdown' }));

      expect(wrapInMarkdownFence).toHaveBeenCalledWith(
        'sequenceDiagram\n  O->>A: Do',
        'Orchestration Execution'
      );
    });
  });

  // ==========================================================================
  // Flow subcommand
  // ==========================================================================

  describe('flow subcommand', () => {
    it('should generate flow diagram', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { generateFlowDiagram } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'flow']));

      expect(generateFlowDiagram).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('graph TD');
    });

    it('should pass 11 execution flow steps', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { generateFlowDiagram } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'flow']));

      const call = vi.mocked(generateFlowDiagram).mock.calls[0]!;
      expect(call).toBeDefined();
      expect(call[0]).toHaveLength(11);
    });
  });

  // ==========================================================================
  // Summary subcommand
  // ==========================================================================

  describe('summary subcommand', () => {
    it('should generate system summary using gathered data', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { generateSystemSummary } = await import('../utils/visual-output.js');
      const { gatherSystemSummary } = await import('./visualize-summary.js');

      handleVisualizeCommand(makeArgs(['visualize', 'summary']));

      expect(gatherSystemSummary).toHaveBeenCalled();
      expect(generateSystemSummary).toHaveBeenCalled();
    });

    it('should output summary content to stdout', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');

      handleVisualizeCommand(makeArgs(['visualize', 'summary']));

      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('SUMMARY');
    });
  });

  // ==========================================================================
  // Output to file
  // ==========================================================================

  describe('output to file', () => {
    it('should write to file when --output is specified', async () => {
      const mockWriteFileSync = vi.fn();
      vi.doMock('node:fs', () => ({
        writeFileSync: mockWriteFileSync,
      }));

      const { handleVisualizeCommand } = await import('./visualize-command.js');

      handleVisualizeCommand(
        makeArgs(['visualize', 'architecture'], { output: '/tmp/test-out.md' })
      );

      // writeOutput uses dynamic import('node:fs'), which is async.
      // Wait for the microtask to resolve.
      await vi.waitFor(() => {
        const calls = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
        expect(calls).toContain('/tmp/test-out.md');
      });

      vi.doUnmock('node:fs');
    });

    it('should write to stdout when no --output is specified', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');

      handleVisualizeCommand(makeArgs(['visualize', 'flow']));

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('graph TD');
    });
  });

  // ==========================================================================
  // Default format behavior
  // ==========================================================================

  describe('default format', () => {
    it('should default to mermaid format when no --format is specified', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');
      const { wrapInMarkdownFence } = await import('../utils/visual-output.js');

      handleVisualizeCommand(makeArgs(['visualize', 'architecture']));

      // Should NOT wrap in markdown when format defaults to mermaid
      expect(wrapInMarkdownFence).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty positionals array gracefully', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');

      expect(() => {
        handleVisualizeCommand(makeArgs([]));
      }).toThrow('process.exit called');

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit with INVALID_ARGS for unknown subcommand string', async () => {
      const { handleVisualizeCommand } = await import('./visualize-command.js');

      expect(() => {
        handleVisualizeCommand(makeArgs(['visualize', '']));
      }).toThrow('process.exit called');

      expect(exitSpy).toHaveBeenCalledWith(3);
    });
  });
});
