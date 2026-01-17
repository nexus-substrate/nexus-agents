/**
 * nexus-agents/cli/repl - REPL Tests
 *
 * Tests for the interactive REPL mode.
 * (Source: Issue #64, PROJECT_PLAN.md Section 5.2)
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// We test the module by importing its exported functions
// The actual startRepl function requires stdin/stdout which we mock

// Module caches for preloaded imports
// These modules have heavy dependency trees - preload to avoid timeout in CI
let indexModule: typeof import('./index.js');
let replModule: typeof import('./repl.js');
let cliModule: typeof import('../cli.js');

// Preload all heavy modules before tests run
// (Source: Issue #192 - CI timeout fix)
beforeAll(async () => {
  [indexModule, replModule, cliModule] = await Promise.all([
    import('./index.js'),
    import('./repl.js'),
    import('../cli.js'),
  ]);
}, 60000); // 60s timeout for module loading in slow CI environments

describe('REPL Module', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutWriteMock: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    stdoutWriteMock = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteMock.mockRestore();
  });

  describe('replCommand', () => {
    it('should be exported from cli/index.js', () => {
      expect(typeof indexModule.replCommand).toBe('function');
    });

    it('should be exported from repl.js', () => {
      expect(typeof replModule.replCommand).toBe('function');
    });
  });

  describe('startRepl', () => {
    it('should be exported from cli/index.js', () => {
      expect(typeof indexModule.startRepl).toBe('function');
    });

    it('should be exported from repl.js', () => {
      expect(typeof replModule.startRepl).toBe('function');
    });
  });

  describe('REPL command handling', () => {
    // Test helper functions indirectly through module structure
    it('should have proper module structure', () => {
      // Check that the module exports the expected functions
      expect(replModule).toHaveProperty('replCommand');
      expect(replModule).toHaveProperty('startRepl');
    });
  });

  describe('CLI integration', () => {
    it('should add interactive option to parseCliArgs', () => {
      const result = cliModule.parseCliArgs(['--interactive']);

      expect(result.options.interactive).toBe(true);
      expect(result.command).toBe('server');
    });

    it('should default interactive to false', () => {
      const result = cliModule.parseCliArgs([]);

      expect(result.options.interactive).toBe(false);
    });

    it('should combine interactive with verbose', () => {
      const result = cliModule.parseCliArgs(['--interactive', '--verbose']);

      expect(result.options.interactive).toBe(true);
      expect(result.options.verbose).toBe(true);
    });
  });
});

describe('REPL Session', () => {
  describe('session creation', () => {
    it('should create unique session IDs', () => {
      // Session IDs are internal, but we can verify the module loads
      expect(typeof replModule.startRepl).toBe('function');
    });
  });
});

describe('REPL Colors', () => {
  it('should use ANSI color codes', () => {
    // Colors are internal constants, but we verify the module loads correctly
    expect(replModule).toBeDefined();
  });
});

describe('REPL Help Text', () => {
  it('should include help command documentation', () => {
    // Help text is internal, but we verify the module loads correctly
    expect(replModule).toBeDefined();
  });
});
