/**
 * Tests for status-command.ts (Issue #688, #691)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process to avoid real subprocess spawns (perf: saves ~40s)
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    execFileSync: vi.fn(() => {
      throw new Error('not found');
    }),
  };
});

// Preload heavy modules before mocking
await import('../version.js');
await import('../governance/fitness-score.js');

// Pre-import status module once (CLI detection runs on import/call)
const statusModule = await import('./status-command.js');

describe('status-command', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('exports handleStatusCommand and collectStatus', () => {
    expect(typeof statusModule.handleStatusCommand).toBe('function');
    expect(typeof statusModule.collectStatus).toBe('function');
  });

  it('collectStatus returns expected shape', () => {
    const { collectStatus } = statusModule;
    const status = collectStatus();

    expect(status).toHaveProperty('version');
    expect(status).toHaveProperty('nodeVersion');
    expect(status).toHaveProperty('fitnessScore');
    expect(status).toHaveProperty('fitnessTarget');
    expect(status).toHaveProperty('adapters');
    expect(status).toHaveProperty('cliTools');
    expect(status).toHaveProperty('adapterStrategy');
    expect(status).toHaveProperty('timestamp');
  });

  it('fitness score is between 0 and 100', () => {
    const { collectStatus } = statusModule;
    const status = collectStatus();

    expect(typeof status.fitnessScore).toBe('number');
    expect(status.fitnessScore).toBeGreaterThan(0);
    expect(status.fitnessScore).toBeLessThanOrEqual(100);
  });

  it('node version matches runtime', () => {
    const { collectStatus } = statusModule;
    const status = collectStatus();

    expect(status.nodeVersion).toBe(process.version);
    expect(status.nodeVersion).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('fitness target is 90', () => {
    const { collectStatus } = statusModule;
    const status = collectStatus();

    expect(status.fitnessTarget).toBe(90);
  });

  it('timestamp is valid ISO string', () => {
    const { collectStatus } = statusModule;
    const status = collectStatus();

    expect(new Date(status.timestamp).toISOString()).toBe(status.timestamp);
  });

  it('detects available API adapters from env', () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
    process.env['GOOGLE_AI_API_KEY'] = 'test-key';
    delete process.env['OPENAI_API_KEY'];

    const { collectStatus } = statusModule;
    const status = collectStatus();

    const claude = status.adapters.find((a) => a.name === 'Claude');
    const gemini = status.adapters.find((a) => a.name === 'Gemini');
    const openai = status.adapters.find((a) => a.name === 'OpenAI');

    expect(claude?.available).toBe(true);
    expect(gemini?.available).toBe(true);
    expect(openai?.available).toBe(false);
  });

  it('marks adapters unavailable when env vars missing', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['GOOGLE_AI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];

    const { collectStatus } = statusModule;
    const status = collectStatus();

    for (const adapter of status.adapters) {
      expect(adapter.available).toBe(false);
    }
  });

  it('cliTools contains all three CLIs', () => {
    const { collectStatus } = statusModule;
    const status = collectStatus();

    expect(status.cliTools).toHaveLength(3);
    const names = status.cliTools.map((t) => t.binary);
    expect(names).toContain('claude');
    expect(names).toContain('gemini');
    expect(names).toContain('codex');
  });

  it('cliTools entries have correct shape', () => {
    const { collectStatus } = statusModule;
    const status = collectStatus();

    for (const tool of status.cliTools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('binary');
      expect(typeof tool.installed).toBe('boolean');
      if (tool.installed) {
        expect(typeof tool.version).toBe('string');
      } else {
        expect(tool.version).toBeNull();
      }
    }
  });

  it('adapterStrategy reflects available adapters', () => {
    const { collectStatus } = statusModule;
    const status = collectStatus();

    expect(typeof status.adapterStrategy).toBe('string');
    expect(status.adapterStrategy.length).toBeGreaterThan(0);
  });

  it('renders table output with CLI tools section', () => {
    const writeMock = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(writeMock);

    const { handleStatusCommand } = statusModule;
    handleStatusCommand(createArgs({}));

    const output = (writeMock.mock.calls as unknown[][]).map((c) => String(c[0])).join('');
    expect(output).toContain('nexus-agents');
    expect(output).toContain('Project Health Dashboard');
    expect(output).toContain('Fitness Score');
    expect(output).toContain('Node.js');
    expect(output).toContain('CLI Tools');
    expect(output).toContain('API Keys');
    expect(output).toContain('Strategy');
  });
});

// ============================================================================
// Helpers
// ============================================================================

function createArgs(overrides: Record<string, unknown>): {
  command: 'status';
  options: {
    help: boolean;
    version: boolean;
    verbose: boolean;
    interactive: boolean;
    all: boolean;
    mode: 'server';
    force: boolean;
    format: string;
    dryRun: boolean;
    banditStats: boolean;
    setup: boolean;
    skipChecks: boolean;
    createIssue: boolean;
    fix: boolean;
    quick: boolean;
    resume: boolean;
    nonInteractive: boolean;
    skipMcp: boolean;
    skipRules: boolean;
    skipHooks: boolean;
    skipConfig: boolean;
    skipOpencode: boolean;
    skipGemini: boolean;
    skipCodex: boolean;
    mock: boolean;
    deep: boolean;
    live: boolean;
  };
  positionals: string[];
} {
  return {
    command: 'status' as const,
    options: {
      help: false,
      version: false,
      verbose: false,
      interactive: false,
      all: false,
      mode: 'server' as const,
      force: false,
      format: (overrides['format'] as string) ?? 'table',
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
      skipConfig: false,
      skipOpencode: false,
      skipGemini: false,
      skipCodex: false,
      mock: false,
      deep: false,
      live: false,
    },
    positionals: [],
  };
}
