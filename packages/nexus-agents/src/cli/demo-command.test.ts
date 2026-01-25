/**
 * Tests for demo command
 *
 * Verifies API-free demo functionality across all subcommands.
 * (Source: Issue #424 - Demo mode for API-free exploration)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  demoCommand,
  runRoutingDemo,
  runExpertListDemo,
  runWorkflowDemo,
  isValidDemoSubcommand,
} from './demo-command.js';

describe('demo-command', () => {
  let stdoutWriteMock: ReturnType<typeof vi.fn>;
  let stderrWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteMock = vi.fn();
    stderrWriteMock = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(stdoutWriteMock);
    vi.spyOn(process.stderr, 'write').mockImplementation(stderrWriteMock);
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isValidDemoSubcommand', () => {
    it('should return true for valid subcommands', () => {
      expect(isValidDemoSubcommand('routing')).toBe(true);
      expect(isValidDemoSubcommand('expert-list')).toBe(true);
      expect(isValidDemoSubcommand('workflow')).toBe(true);
    });

    it('should return false for invalid subcommands', () => {
      expect(isValidDemoSubcommand('invalid')).toBe(false);
      expect(isValidDemoSubcommand(undefined)).toBe(false);
      expect(isValidDemoSubcommand('')).toBe(false);
    });
  });

  describe('runRoutingDemo', () => {
    it('should return formatted routing output', () => {
      const result = runRoutingDemo('Implement a sorting algorithm');

      expect(result).toContain('Routing Demo');
      expect(result).toContain('Task Analysis');
      expect(result).toContain('Budget Filter');
      expect(result).toContain('TOPSIS Ranking');
      expect(result).toContain('Selected:');
    });

    it('should detect code tasks', () => {
      const result = runRoutingDemo('Write a function to parse JSON');

      expect(result).toContain('Code Generation: yes');
    });

    it('should detect reasoning tasks', () => {
      const result = runRoutingDemo('Explain how closures work');

      expect(result).toContain('Reasoning:       yes');
    });

    it('should show mock disclaimer', () => {
      const result = runRoutingDemo('Any task');

      expect(result).toContain('mock response');
      expect(result).toContain('no API keys required');
    });

    it('should select codex for pure code tasks', () => {
      const result = runRoutingDemo('Implement a sorting function');

      expect(result).toContain('Selected: codex');
    });

    it('should select claude for reasoning tasks', () => {
      const result = runRoutingDemo('Explain and analyze this architecture');

      expect(result).toContain('Selected: claude');
    });
  });

  describe('runExpertListDemo', () => {
    it('should return formatted expert list', () => {
      const result = runExpertListDemo();

      expect(result).toContain('Expert List Demo');
      expect(result).toContain('Built-in Experts');
      expect(result).toContain('Code Expert');
      expect(result).toContain('Security Expert');
    });

    it('should include all 5 built-in experts', () => {
      const result = runExpertListDemo();

      expect(result).toContain('Code Expert');
      expect(result).toContain('Security Expert');
      expect(result).toContain('Architecture Expert');
      expect(result).toContain('Documentation Expert');
      expect(result).toContain('Testing Expert');
    });

    it('should show expert roles', () => {
      const result = runExpertListDemo();

      expect(result).toContain('code_expert');
      expect(result).toContain('security_expert');
      expect(result).toContain('architecture_expert');
    });

    it('should show mock disclaimer', () => {
      const result = runExpertListDemo();

      expect(result).toContain('no API keys required');
    });
  });

  describe('runWorkflowDemo', () => {
    it('should list available workflows when no name provided', () => {
      const result = runWorkflowDemo(undefined);

      expect(result).toContain('Available Workflows');
      expect(result).toContain('code-review');
      expect(result).toContain('feature-implementation');
      expect(result).toContain('security-audit');
    });

    it('should show workflow details for valid workflow name', () => {
      const result = runWorkflowDemo('code-review');

      expect(result).toContain('Workflow Demo: code-review');
      expect(result).toContain('Description');
      expect(result).toContain('Required Inputs');
      expect(result).toContain('Execution Steps');
    });

    it('should show workflow steps', () => {
      const result = runWorkflowDemo('code-review');

      expect(result).toContain('analyze');
      expect(result).toContain('security');
      expect(result).toContain('synthesize');
    });

    it('should show agents for each step', () => {
      const result = runWorkflowDemo('code-review');

      expect(result).toContain('code_expert');
      expect(result).toContain('security_expert');
      expect(result).toContain('tech_lead');
    });

    it('should show not found message for invalid workflow', () => {
      const result = runWorkflowDemo('nonexistent-workflow');

      expect(result).toContain('not found');
      expect(result).toContain('Available Workflows');
    });

    it('should show what would happen section', () => {
      const result = runWorkflowDemo('feature-implementation');

      expect(result).toContain('What would happen');
      expect(result).toContain('validates all required inputs');
    });
  });

  describe('demoCommand', () => {
    it('should print help when no subcommand provided', () => {
      const exitCode = demoCommand(undefined, []);

      expect(exitCode).toBe(0);
      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('USAGE');
      expect(output).toContain('SUBCOMMANDS');
    });

    it('should return 1 for invalid subcommand', () => {
      const exitCode = demoCommand('invalid', []);

      expect(exitCode).toBe(1);
    });

    it('should handle routing subcommand', () => {
      const exitCode = demoCommand('routing', ['Test task']);

      expect(exitCode).toBe(0);
      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Routing Demo');
    });

    it('should return error for routing without task', () => {
      const exitCode = demoCommand('routing', []);

      expect(exitCode).toBe(1);
      expect(stderrWriteMock).toHaveBeenCalled();
    });

    it('should handle expert-list subcommand', () => {
      const exitCode = demoCommand('expert-list', []);

      expect(exitCode).toBe(0);
      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Expert List Demo');
    });

    it('should handle workflow subcommand without name', () => {
      const exitCode = demoCommand('workflow', []);

      expect(exitCode).toBe(0);
      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Available Workflows');
    });

    it('should handle workflow subcommand with name', () => {
      const exitCode = demoCommand('workflow', ['code-review']);

      expect(exitCode).toBe(0);
      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Workflow Demo: code-review');
    });
  });

  describe('educational content', () => {
    it('should explain routing process', () => {
      const result = runRoutingDemo('Any task');

      expect(result).toContain('Task Analysis');
      expect(result).toContain('Budget Filter');
      expect(result).toContain('TOPSIS Ranking');
    });

    it('should explain expert capabilities', () => {
      const result = runExpertListDemo();

      expect(result).toContain('Code implementation');
      expect(result).toContain('Security analysis');
      expect(result).toContain('System design');
    });

    it('should explain workflow execution', () => {
      const result = runWorkflowDemo('code-review');

      expect(result).toContain('Execution Steps');
      expect(result).toContain('What would happen');
    });
  });
});
