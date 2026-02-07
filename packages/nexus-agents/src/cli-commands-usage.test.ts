import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  printIndexUsage,
  printOrchestrateUsage,
  printResearchUsage,
  printRoutingAuditUsage,
  printValidationUsage,
  printVoteUsage,
  printWorkflowRunUsage,
} from './cli-commands-usage.js';

describe('cli-commands-usage', () => {
  let writeSpy: MockInstance;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  describe('printWorkflowRunUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printWorkflowRunUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printWorkflowRunUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('workflow run');
    });

    it('should include Usage: in output', () => {
      printWorkflowRunUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });
  });

  describe('printRoutingAuditUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printRoutingAuditUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printRoutingAuditUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('routing-audit');
    });

    it('should include Usage: in output', () => {
      printRoutingAuditUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Examples: in output', () => {
      printRoutingAuditUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Examples:');
    });
  });

  describe('printOrchestrateUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printOrchestrateUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printOrchestrateUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('orchestrate');
    });

    it('should include Usage: in output', () => {
      printOrchestrateUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Examples: in output', () => {
      printOrchestrateUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Examples:');
    });
  });

  describe('printVoteUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printVoteUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printVoteUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('vote');
    });

    it('should include Usage: in output', () => {
      printVoteUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Examples: in output', () => {
      printVoteUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Examples:');
    });
  });

  describe('printIndexUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printIndexUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printIndexUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('index');
    });

    it('should include Usage: in output', () => {
      printIndexUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Subcommands: in output', () => {
      printIndexUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Subcommands:');
    });
  });

  describe('printResearchUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printResearchUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printResearchUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('research');
    });

    it('should include Usage: in output', () => {
      printResearchUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Subcommands: in output', () => {
      printResearchUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Subcommands:');
    });
  });

  describe('printValidationUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printValidationUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printValidationUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('validation');
    });

    it('should include Usage: in output', () => {
      printValidationUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Examples: in output', () => {
      printValidationUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Examples:');
    });

    it('should include Options: in output', () => {
      printValidationUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Options:');
    });
  });
});
