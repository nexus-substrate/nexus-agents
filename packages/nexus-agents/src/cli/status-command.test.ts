/**
 * Tests for status-command.ts (Issue #688)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Preload heavy modules before mocking
await import('../version.js');
await import('../governance/fitness-score.js');

describe('status-command', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('exports handleStatusCommand and collectStatus', async () => {
    const mod = await import('./status-command.js');
    expect(typeof mod.handleStatusCommand).toBe('function');
    expect(typeof mod.collectStatus).toBe('function');
  });

  it('collectStatus returns expected shape', async () => {
    const { collectStatus } = await import('./status-command.js');
    const status = collectStatus();

    expect(status).toHaveProperty('version');
    expect(status).toHaveProperty('nodeVersion');
    expect(status).toHaveProperty('fitnessScore');
    expect(status).toHaveProperty('fitnessTarget');
    expect(status).toHaveProperty('adapters');
    expect(status).toHaveProperty('timestamp');
  });

  it('fitness score is between 0 and 100', async () => {
    const { collectStatus } = await import('./status-command.js');
    const status = collectStatus();

    expect(typeof status.fitnessScore).toBe('number');
    expect(status.fitnessScore).toBeGreaterThan(0);
    expect(status.fitnessScore).toBeLessThanOrEqual(100);
  });

  it('node version matches runtime', async () => {
    const { collectStatus } = await import('./status-command.js');
    const status = collectStatus();

    expect(status.nodeVersion).toBe(process.version);
    expect(status.nodeVersion).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('fitness target is 90', async () => {
    const { collectStatus } = await import('./status-command.js');
    const status = collectStatus();

    expect(status.fitnessTarget).toBe(90);
  });

  it('timestamp is valid ISO string', async () => {
    const { collectStatus } = await import('./status-command.js');
    const status = collectStatus();

    expect(new Date(status.timestamp).toISOString()).toBe(status.timestamp);
  });

  it('detects available API adapters from env', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
    process.env['GOOGLE_AI_API_KEY'] = 'test-key';
    delete process.env['OPENAI_API_KEY'];

    const { collectStatus } = await import('./status-command.js');
    const status = collectStatus();

    const claude = status.adapters.find((a) => a.name === 'Claude');
    const gemini = status.adapters.find((a) => a.name === 'Gemini');
    const openai = status.adapters.find((a) => a.name === 'OpenAI');

    expect(claude?.available).toBe(true);
    expect(gemini?.available).toBe(true);
    expect(openai?.available).toBe(false);
  });

  it('marks adapters unavailable when env vars missing', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['GOOGLE_AI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];

    const { collectStatus } = await import('./status-command.js');
    const status = collectStatus();

    for (const adapter of status.adapters) {
      expect(adapter.available).toBe(false);
    }
  });

  it('renders table output with expected sections', async () => {
    const writeMock = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(writeMock);

    const { handleStatusCommand } = await import('./status-command.js');
    handleStatusCommand(createArgs({}));

    const output = (writeMock.mock.calls as unknown[][]).map((c) => String(c[0])).join('');
    expect(output).toContain('nexus-agents');
    expect(output).toContain('Project Health Dashboard');
    expect(output).toContain('Fitness Score');
    expect(output).toContain('Node.js');
    expect(output).toContain('API Adapters');
    expect(output).toContain('Claude');
    expect(output).toContain('Gemini');
    expect(output).toContain('OpenAI');
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
    mock: boolean;
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
      mock: false,
    },
    positionals: [],
  };
}
