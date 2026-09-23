/**
 * Tests for Doctor Command
 *
 * Verifies health check functionality for CLI adapters, Node.js version,
 * API keys, configuration files, and MCP server readiness.
 *
 * (Source: Issue #422 - Doctor command validations)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDoctor, printDoctorResults, doctorCommand } from './doctor.js';
import type { DoctorResult } from './doctor.js';

const { TEST_VERSION } = vi.hoisted(() => ({ TEST_VERSION: '1.0.0' }));

vi.mock('../version.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../version.js')>();
  return { ...actual, VERSION: TEST_VERSION };
});

// Keep freshness measured and aligned by default so healthy-path tests do not
// depend on whether this test host has a global nexus-agents install.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn() };
});

// Mock the factory module
vi.mock('../cli-adapters/factory.js', () => ({
  createAllAdapters: vi.fn(),
}));

// #6119: the client-mode verdict is measured by `codex mcp-server --help`.
// Default to a codex that still serves it; the unavailable case is a test.
vi.mock('../cli-adapters/codex-mcp-server-probe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli-adapters/codex-mcp-server-probe.js')>();
  return { ...actual, codexMcpServerAvailable: vi.fn(() => true) };
});

// The pinned-model probe (#6120) spends a real claude call; stub it here and
// keep the formatter real. doctor.ts imports the probe directly, so the spread
// form intercepts it (no internal sibling indirection).
vi.mock('./doctor-claude-model.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./doctor-claude-model.js')>();
  return {
    ...actual,
    probeClaudePinnedModel: vi.fn((deps: { installed: boolean }) =>
      Promise.resolve({
        alias: 'fable',
        status: deps.installed ? ('available' as const) : ('not-probed' as const),
        reason: deps.installed ? null : 'claude CLI not installed',
      })
    ),
  };
});

// Mock the MCP server module
vi.mock('../mcp/server.js', () => ({
  createServer: vi.fn(() => ({ ok: true })),
}));

// Mock fs.existsSync for config file checks
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  // #4488: the scratch-space check reads statfs. A roomy reading keeps these
  // tests about CLI/auth health rather than disk state.
  statfsSync: vi.fn(() => ({
    bsize: 4096,
    blocks: (32 * 1024 ** 3) / 4096,
    bfree: (20 * 1024 ** 3) / 4096,
    bavail: (20 * 1024 ** 3) / 4096,
    files: 0,
    ffree: 0,
  })),
}));

// Mock the auth probe — by default, every CLI is authenticated. Individual
// tests override this when they're testing not-authed paths. (#2447)
vi.mock('./cli-auth-probe.js', () => ({
  probeCli: vi.fn((cli: string) =>
    Promise.resolve({
      cli,
      state: 'authenticated' as const,
      via: 'cli-credentials' as const,
    })
  ),
}));

import { createAllAdapters } from '../cli-adapters/factory.js';
import { codexMcpServerAvailable } from '../cli-adapters/codex-mcp-server-probe.js';
import { probeClaudePinnedModel } from './doctor-claude-model.js';
import { createServer } from '../mcp/server.js';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Helper to create a complete DoctorResult for print tests.
 */
function createMockDoctorResult(overrides: Partial<DoctorResult> = {}): DoctorResult {
  return {
    clis: [
      {
        name: 'claude',
        installed: true,
        version: '2.0.76',
        versionStatus: 'supported',
        authenticated: true,
        authState: 'authenticated',
        authMethod: 'CLI auth',
      },
      {
        name: 'gemini',
        installed: true,
        version: '0.22.5',
        versionStatus: 'supported',
        authenticated: true,
        authState: 'authenticated',
        authMethod: 'ADC/CLI auth',
      },
      {
        name: 'codex',
        installed: true,
        version: '0.77.0',
        versionStatus: 'supported',
        authenticated: true,
        authState: 'authenticated',
        authMethod: 'CLI auth',
      },
    ],
    nodeVersion: {
      version: 'v22.0.0',
      major: 22,
      supported: true,
    },
    apiKeys: [
      { name: 'ANTHROPIC_API_KEY', configured: true },
      { name: 'OPENAI_API_KEY', configured: false },
      { name: 'GOOGLE_AI_API_KEY', configured: false },
    ],
    configFile: { found: false, path: null },
    mcpServerReady: true,
    mcpClientReady: true,
    disabledClis: [],
    registryAdvisory: {
      totalModels: 11,
      availableModels: 11,
      unavailableModels: 0,
      models: [],
      registryAgeDays: 1,
      registryStale: false,
    },
    learningPersistence: {
      enabled: false,
      dirExists: false,
      dirWritable: false,
      outcomeCount: 0,
      fileEligibleOutcomeCount: 0,
      routedOutcomes: { total: 0, last7Days: 0 },
      ruleCount: 0,
      activeRuleCount: 0,
      trainedOnEligible: null,
      rulesLastSaved: null,
      error: null,
    },
    sqliteCheck: {
      available: true,
      error: null,
    },
    dataDirectory: {
      rootExists: true,
      rootPath: '/home/test/.nexus-agents',
      repoRoot: null,
      subdirectories: [],
    },
    sandbox: {
      active: false,
      flavor: undefined,
      root: undefined,
      heuristicMatch: 'unknown' as const,
      mismatch: false,
      dataDirInsideRepo: false,
    },
    installFreshness: { state: 'aligned' as const, version: '1.0.0' },
    harnessAlignment: {
      inProject: true,
      agentsMdExists: true,
      files: [],
      alignedCount: 0,
      driftCount: 0,
      missingCount: 0,
    },
    voterTransport: { configured: false },
    claudeModel: { alias: 'fable', status: 'available' as const, reason: null },
    scratchSpace: [
      {
        label: 'nexus' as const,
        root: '/tmp/nexus-test',
        available: true,
        freeBytes: 20 * 1024 ** 3,
        totalBytes: 32 * 1024 ** 3,
        percentUsed: 38,
        severity: 'ok' as const,
        message: '20.0 GiB free of 32.0 GiB (38% used)',
      },
    ],
    allHealthy: true,
    timestamp: new Date(),
    ...overrides,
  };
}

describe('Doctor Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execFileSync).mockReturnValue(
      JSON.stringify({ dependencies: { 'nexus-agents': { version: TEST_VERSION } } })
    );
    // Default mock for MCP server
    vi.mocked(createServer).mockReturnValue({ ok: true } as never);
    // Default mock for config file
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runDoctor()', () => {
    it('should return healthy result when all CLIs are available', async () => {
      const mockAdapter = {
        name: 'claude',
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          version: '2.0.76',
          versionStatus: 'supported',
          lastChecked: new Date(),
        }),
        getCapacity: vi.fn().mockResolvedValue({
          remainingTokens: 100000,
          remainingRequests: 100,
          resetTime: new Date(),
          utilizationPercent: 15,
          rateLimited: false,
          exhausted: false,
          quotaExhausted: false,
          observed: true,
        }),
      };

      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
        ['opencode', { ...mockAdapter, name: 'opencode' }],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.installFreshness).toEqual({ state: 'aligned', version: TEST_VERSION });
      expect(result.allHealthy).toBe(true);
      expect(result.mcpServerReady).toBe(true);
      expect(result.mcpClientReady).toBe(true);
      expect(result.clis).toHaveLength(4);
      expect(result.nodeVersion).toBeDefined();
      expect(result.apiKeys).toHaveLength(3);
      expect(result.configFile).toBeDefined();
    });

    it('reports CLIs disabled by NEXUS_DISABLED_CLIS and does not probe them (#6590)', async () => {
      const saved = process.env['NEXUS_DISABLED_CLIS'];
      process.env['NEXUS_DISABLED_CLIS'] = 'gemini,codex';
      try {
        const healthCheck = vi.fn().mockResolvedValue({
          healthy: true,
          version: '1.0.0',
          versionStatus: 'supported',
          lastChecked: new Date(),
        });
        const adapter = { healthCheck, getCapacity: vi.fn().mockRejectedValue(new Error('n/a')) };
        // All four slots present: doctor itself must skip the disabled ones.
        vi.mocked(createAllAdapters).mockReturnValue(
          new Map([
            ['claude', adapter],
            ['gemini', adapter],
            ['codex', adapter],
            ['opencode', adapter],
          ]) as never
        );

        const result = await runDoctor();

        expect(result.disabledClis).toEqual(['gemini', 'codex']);
        expect(result.clis.map((c) => c.name)).toEqual(['claude', 'opencode']);
      } finally {
        if (saved === undefined) delete process.env['NEXUS_DISABLED_CLIS'];
        else process.env['NEXUS_DISABLED_CLIS'] = saved;
      }
    });

    it('reports no disabled CLIs when NEXUS_DISABLED_CLIS is unset (#6590)', async () => {
      const saved = process.env['NEXUS_DISABLED_CLIS'];
      delete process.env['NEXUS_DISABLED_CLIS'];
      try {
        vi.mocked(createAllAdapters).mockReturnValue(new Map() as never);
        const result = await runDoctor();
        expect(result.disabledClis).toEqual([]);
        expect(result.clis.map((c) => c.name)).toEqual(['claude', 'gemini', 'codex', 'opencode']);
      } finally {
        if (saved !== undefined) process.env['NEXUS_DISABLED_CLIS'] = saved;
      }
    });

    it('should include Node.js version check', async () => {
      const mockAdapters = new Map();
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.nodeVersion).toBeDefined();
      expect(result.nodeVersion.version).toBe(process.version);
      expect(typeof result.nodeVersion.major).toBe('number');
      expect(typeof result.nodeVersion.supported).toBe('boolean');
    });

    it('probes the pinned claude model with the claude install state and reports it (#6120)', async () => {
      vi.mocked(createAllAdapters).mockReturnValue(new Map() as never);
      const probe = vi.fn((installed: boolean) =>
        Promise.resolve({
          alias: 'fable',
          status: installed ? ('available' as const) : ('not-probed' as const),
          reason: installed ? null : 'claude CLI not installed',
        })
      );

      const result = await runDoctor({ probeClaudeModel: probe });

      // No adapters → claude is not installed → the probe is told so, and its
      // verdict (not an inferred one) is what the report carries.
      expect(probe).toHaveBeenCalledWith(false);
      expect(result.claudeModel).toEqual({
        alias: 'fable',
        status: 'not-probed',
        reason: 'claude CLI not installed',
      });
    });

    it('reaches the real probe when no override is supplied (#6120)', async () => {
      vi.mocked(createAllAdapters).mockReturnValue(new Map() as never);

      const result = await runDoctor();

      expect(probeClaudePinnedModel).toHaveBeenCalledWith({ installed: false });
      expect(result.claudeModel.status).toBe('not-probed');
    });

    it('should include API key checks without exposing values', async () => {
      const mockAdapters = new Map();
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.apiKeys).toHaveLength(3);
      expect(result.apiKeys[0]?.name).toBe('ANTHROPIC_API_KEY');
      expect(result.apiKeys[1]?.name).toBe('OPENAI_API_KEY');
      expect(result.apiKeys[2]?.name).toBe('GOOGLE_AI_API_KEY');
      // Should not contain actual key values
      result.apiKeys.forEach((key) => {
        expect(typeof key.configured).toBe('boolean');
      });
    });

    it('should detect configuration file when present', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return path === './nexus-agents.yaml';
      });
      const mockAdapters = new Map();
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.configFile.found).toBe(true);
      expect(result.configFile.path).toBe('./nexus-agents.yaml');
    });

    it('should report config not found when missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const mockAdapters = new Map();
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.configFile.found).toBe(false);
      expect(result.configFile.path).toBeNull();
    });

    it('should validate MCP server can be created', async () => {
      vi.mocked(createServer).mockReturnValue({ ok: true } as never);
      const mockAdapters = new Map();
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.mcpServerReady).toBe(true);
      expect(createServer).toHaveBeenCalledWith({ name: 'nexus-agents-doctor-check' });
    });

    it('should report MCP server not ready when creation fails', async () => {
      vi.mocked(createServer).mockReturnValue({ ok: false, error: {} } as never);
      const mockAdapters = new Map();
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.mcpServerReady).toBe(false);
    });

    it('should mark CLI as not installed when adapter throws ENOENT', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockRejectedValue(new Error('spawn claude ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockRejectedValue(new Error('not found')),
            getCapacity: vi.fn(),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockRejectedValue(new Error('some other error')),
            getCapacity: vi.fn(),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.allHealthy).toBe(false);
      expect(result.clis[0]?.installed).toBe(false);
      expect(result.clis[0]?.error).toBe('Not found in PATH');
      expect(result.clis[1]?.installed).toBe(false);
      expect(result.clis[1]?.error).toBe('Not found in PATH');
      expect(result.clis[2]?.installed).toBe(false);
      expect(result.clis[2]?.error).toBe('some other error');
    });

    it('should handle missing adapter gracefully', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.76',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
        // gemini and codex are missing
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.allHealthy).toBe(false);
      const geminiResult = result.clis.find((c) => c.name === 'gemini');
      expect(geminiResult?.installed).toBe(false);
      expect(geminiResult?.error).toBe('Adapter not available');
    });

    it('should mark outdated versions correctly', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.1',
              versionStatus: 'outdated',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.22.5',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.77.0',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      const claudeResult = result.clis.find((c) => c.name === 'claude');
      expect(claudeResult?.versionStatus).toBe('outdated');
      expect(claudeResult?.fix).toBeDefined();
      expect(claudeResult?.fix).toContain('npm update');
    });

    it('should handle capacity check failures gracefully', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.76',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockRejectedValue(new Error('Capacity unavailable')),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.22.5',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockRejectedValue(new Error('Capacity unavailable')),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.77.0',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockRejectedValue(new Error('Capacity unavailable')),
          },
        ],
        [
          'opencode',
          {
            name: 'opencode',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '1.2.10',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockRejectedValue(new Error('Capacity unavailable')),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.allHealthy).toBe(true);
      expect(result.clis[0]?.capacity).toBeUndefined();
    });

    it('should set mcpClientReady based on Codex installation', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.76',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.22.5',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockRejectedValue(new Error('ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.mcpClientReady).toBe(false);
    });

    it('should report mcpClientReady=false when codex is installed but has no mcp-server (#6119)', async () => {
      const healthy = {
        healthy: true,
        version: '0.154.0',
        versionStatus: 'supported',
        lastChecked: new Date(),
      };
      const mockAdapters = new Map([
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockResolvedValue(healthy),
            getCapacity: vi.fn().mockRejectedValue(new Error('n/a')),
          },
        ],
      ]);
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);
      vi.mocked(codexMcpServerAvailable).mockReturnValueOnce(false);

      const result = await runDoctor();

      expect(result.clis.find((c) => c.name === 'codex')?.installed).toBe(true);
      expect(result.mcpClientReady).toBe(false);
    });

    it('should use CLI auth method instead of hardcoded OAuth', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.76',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.22.5',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.77.0',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      // Should not use hardcoded 'OAuth'
      const claudeResult = result.clis.find((c) => c.name === 'claude');
      expect(claudeResult?.authMethod).toBe('CLI auth');
      const geminiResult = result.clis.find((c) => c.name === 'gemini');
      expect(geminiResult?.authMethod).toBe('ADC/CLI auth');
    });
  });

  describe('registryAdvisory', () => {
    it('should include registry advisory in results', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          version: '2.0.76',
          versionStatus: 'supported',
          lastChecked: new Date(),
        }),
        getCapacity: vi.fn().mockResolvedValue({
          remainingTokens: 100000,
          remainingRequests: 100,
          resetTime: new Date(),
          utilizationPercent: 15,
          rateLimited: false,
          exhausted: false,
          quotaExhausted: false,
          observed: true,
        }),
      };
      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
        ['opencode', { ...mockAdapter, name: 'opencode' }],
      ]);
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.registryAdvisory).toBeDefined();
      expect(result.registryAdvisory.totalModels).toBeGreaterThan(0);
      expect(result.registryAdvisory.availableModels).toBe(result.registryAdvisory.totalModels);
      expect(result.registryAdvisory.unavailableModels).toBe(0);
    });

    it('should mark models unavailable when CLI missing', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.76',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            }),
          },
        ],
      ]);
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();
      const advisory = result.registryAdvisory;

      expect(advisory.unavailableModels).toBeGreaterThan(0);
      const unavailableModels = advisory.models.filter((m) => !m.available);
      expect(unavailableModels.length).toBe(advisory.unavailableModels);
      // All unavailable should be gemini/codex/opencode
      for (const m of unavailableModels) {
        expect(['gemini', 'codex', 'opencode']).toContain(m.cliName);
        expect(m.reason).toContain('not installed');
      }
    });

    it('should report all models available when all CLIs installed', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          version: '1.0.0',
          versionStatus: 'supported',
          lastChecked: new Date(),
        }),
        getCapacity: vi.fn().mockResolvedValue({
          remainingTokens: 100000,
          remainingRequests: 100,
          resetTime: new Date(),
          utilizationPercent: 15,
          rateLimited: false,
          exhausted: false,
          quotaExhausted: false,
          observed: true,
        }),
      };
      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
        ['opencode', { ...mockAdapter, name: 'opencode' }],
      ]);
      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.registryAdvisory.availableModels).toBe(result.registryAdvisory.totalModels);
      expect(result.registryAdvisory.unavailableModels).toBe(0);
    });
  });

  describe('printDoctorResults()', () => {
    it('should write output to stdout', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult();

      printDoctorResults(result);

      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Nexus Agents Doctor');
      expect(output).toContain('Claude CLI');
      expect(output).toContain('2.0.76');
      expect(output).toContain('Status: Ready');

      writeSpy.mockRestore();
    });

    it('should show Node.js version check', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult();

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Node.js version');
      expect(output).toContain('v22.0.0');

      writeSpy.mockRestore();
    });

    it('should show warning for unsupported Node.js version', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({
        nodeVersion: { version: 'v18.0.0', major: 18, supported: false },
        allHealthy: false,
      });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Node.js version');
      expect(output).toContain('v18.0.0');
      expect(output).toContain('Warning');
      expect(output).toContain('>=22.5.0');

      writeSpy.mockRestore();
    });

    it('should show API key configuration status', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({
        apiKeys: [
          { name: 'ANTHROPIC_API_KEY', configured: true },
          { name: 'OPENAI_API_KEY', configured: true },
          { name: 'GOOGLE_AI_API_KEY', configured: false },
        ],
      });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('API keys configured');
      expect(output).toContain('2 of 3');
      expect(output).toContain('ANTHROPIC_API_KEY');
      expect(output).toContain('OPENAI_API_KEY');

      writeSpy.mockRestore();
    });

    it('should show hint when no API keys configured', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({
        apiKeys: [
          { name: 'ANTHROPIC_API_KEY', configured: false },
          { name: 'OPENAI_API_KEY', configured: false },
          { name: 'GOOGLE_AI_API_KEY', configured: false },
        ],
      });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('API keys configured');
      expect(output).toContain('0 of 3');
      expect(output).toContain('Set ANTHROPIC_API_KEY');

      writeSpy.mockRestore();
    });

    it('should show voter transport as CLI subprocess when no gateway is configured', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({ voterTransport: { configured: false } });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Voter transport');
      expect(output).toContain('CLI subprocess');
      expect(output).toContain('NEXUS_OPENAI_COMPAT_URL');

      writeSpy.mockRestore();
    });

    it('should show voter transport as in-process gateway when configured', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({ voterTransport: { configured: true } });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Voter transport');
      expect(output).toContain('In-process gateway');

      writeSpy.mockRestore();
    });

    it('should show configuration file status', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({
        configFile: { found: true, path: './nexus-agents.yaml' },
      });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Configuration loaded');
      expect(output).toContain('./nexus-agents.yaml');

      writeSpy.mockRestore();
    });

    it('should show hint when config file not found', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({
        configFile: { found: false, path: null },
      });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Configuration file');
      expect(output).toContain('Not found');
      expect(output).toContain('nexus-agents config init');

      writeSpy.mockRestore();
    });

    it('should show error message for uninstalled CLI', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({
        clis: [
          {
            name: 'claude',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
            authState: 'not-authenticated',
            error: 'Not found in PATH',
            fix: 'npm install -g @anthropic-ai/claude-code',
          },
          {
            name: 'gemini',
            installed: true,
            version: '0.22.5',
            versionStatus: 'supported',
            authenticated: true,
            authState: 'authenticated',
          },
          {
            name: 'codex',
            installed: true,
            version: '0.77.0',
            versionStatus: 'supported',
            authenticated: true,
            authState: 'authenticated',
          },
        ],
        allHealthy: false,
      });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Not found in PATH');
      expect(output).toContain('npm install -g');
      expect(output).toContain('issue(s) found');

      writeSpy.mockRestore();
    });

    it('should show capacity information when available', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({
        clis: [
          {
            name: 'claude',
            installed: true,
            version: '2.0.76',
            versionStatus: 'supported',
            authenticated: true,
            authState: 'authenticated',
            capacity: {
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              rateLimited: false,
              exhausted: false,
              quotaExhausted: false,
              observed: true,
            },
          },
          {
            name: 'gemini',
            installed: true,
            version: '0.22.5',
            versionStatus: 'supported',
            authenticated: true,
            authState: 'authenticated',
          },
          {
            name: 'codex',
            installed: true,
            version: '0.77.0',
            versionStatus: 'supported',
            authenticated: true,
            authState: 'authenticated',
          },
        ],
      });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('remaining');

      writeSpy.mockRestore();
    });

    it('should handle no installed CLIs gracefully', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({
        clis: [
          {
            name: 'claude',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
            authState: 'not-authenticated',
            error: 'Not found',
          },
          {
            name: 'gemini',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
            authState: 'not-authenticated',
            error: 'Not found',
          },
          {
            name: 'codex',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
            authState: 'not-authenticated',
            error: 'Not found',
          },
        ],
        mcpClientReady: false,
        allHealthy: false,
      });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('No CLIs installed');
      expect(output).toContain('issue(s) found');

      writeSpy.mockRestore();
    });

    it('should show MCP server not ready when creation fails', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result = createMockDoctorResult({
        mcpServerReady: false,
        allHealthy: false,
      });

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('MCP Server mode');
      expect(output).toContain('Not ready');

      writeSpy.mockRestore();
    });
  });

  describe('doctorCommand()', () => {
    it('should return 0 when all healthy', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          version: '2.0.76',
          versionStatus: 'supported',
          lastChecked: new Date(),
        }),
        getCapacity: vi.fn().mockResolvedValue({
          remainingTokens: 100000,
          remainingRequests: 100,
          resetTime: new Date(),
          utilizationPercent: 15,
          rateLimited: false,
          exhausted: false,
          quotaExhausted: false,
          observed: true,
        }),
      };

      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
        ['opencode', { ...mockAdapter, name: 'opencode' }],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const exitCode = await doctorCommand();

      expect(exitCode).toBe(0);
    });

    it('should return 1 when issues found', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockRejectedValue(new Error('ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockRejectedValue(new Error('ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockRejectedValue(new Error('ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const exitCode = await doctorCommand();

      expect(exitCode).toBe(1);
    });

    it('should return 1 when MCP server creation fails', async () => {
      vi.mocked(createServer).mockReturnValue({ ok: false, error: {} } as never);

      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          version: '2.0.76',
          versionStatus: 'supported',
          lastChecked: new Date(),
        }),
        getCapacity: vi.fn().mockResolvedValue({
          remainingTokens: 100000,
          remainingRequests: 100,
          resetTime: new Date(),
          utilizationPercent: 15,
          rateLimited: false,
          exhausted: false,
          quotaExhausted: false,
          observed: true,
        }),
      };

      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
        ['opencode', { ...mockAdapter, name: 'opencode' }],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const exitCode = await doctorCommand();

      expect(exitCode).toBe(1);
    });
  });

  // #2501: sandbox-awareness derivations (dataDirInsideRepo + mismatch)
  describe('checkSandbox()', () => {
    let originalSandbox: string | undefined;
    let originalRoot: string | undefined;
    let originalDataDir: string | undefined;

    beforeEach(() => {
      originalSandbox = process.env['NEXUS_SANDBOX'];
      originalRoot = process.env['NEXUS_SANDBOX_ROOT'];
      originalDataDir = process.env['NEXUS_DATA_DIR'];
      delete process.env['NEXUS_SANDBOX'];
      delete process.env['NEXUS_SANDBOX_ROOT'];
      delete process.env['NEXUS_DATA_DIR'];
    });

    afterEach(() => {
      if (originalSandbox === undefined) delete process.env['NEXUS_SANDBOX'];
      else process.env['NEXUS_SANDBOX'] = originalSandbox;
      if (originalRoot === undefined) delete process.env['NEXUS_SANDBOX_ROOT'];
      else process.env['NEXUS_SANDBOX_ROOT'] = originalRoot;
      if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
      else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    });

    it('returns inactive defaults when NEXUS_SANDBOX is unset', async () => {
      const { checkSandbox } = await import('./doctor.js');
      const result = checkSandbox();
      expect(result.active).toBe(false);
      expect(result.flavor).toBeUndefined();
      expect(result.dataDirInsideRepo).toBe(false);
    });

    it('detects dataDirInsideRepo when NEXUS_DATA_DIR is inside a single repo subfolder', async () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      process.env['NEXUS_SANDBOX_ROOT'] = '/projects';
      process.env['NEXUS_DATA_DIR'] = '/projects/repo1/.nexus-agents';
      const { checkSandbox } = await import('./doctor.js');
      const result = checkSandbox();
      expect(result.active).toBe(true);
      expect(result.dataDirInsideRepo).toBe(true);
    });

    it('does NOT flag dataDirInsideRepo when NEXUS_DATA_DIR is at the multi-repo root', async () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      process.env['NEXUS_SANDBOX_ROOT'] = '/projects';
      process.env['NEXUS_DATA_DIR'] = '/projects/.nexus-agents';
      const { checkSandbox } = await import('./doctor.js');
      const result = checkSandbox();
      expect(result.dataDirInsideRepo).toBe(false);
    });

    it('does NOT flag dataDirInsideRepo when NEXUS_DATA_DIR is outside the sandbox root entirely', async () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      process.env['NEXUS_SANDBOX_ROOT'] = '/projects';
      process.env['NEXUS_DATA_DIR'] = '/var/nexus-state';
      const { checkSandbox } = await import('./doctor.js');
      const result = checkSandbox();
      expect(result.dataDirInsideRepo).toBe(false);
    });
  });

  describe('checkVoterTransport() (#4255)', () => {
    let originalUrl: string | undefined;
    let originalKey: string | undefined;
    let originalOpencodeConfig: string | undefined;

    beforeEach(() => {
      originalUrl = process.env['NEXUS_OPENAI_COMPAT_URL'];
      originalKey = process.env['NEXUS_OPENAI_COMPAT_KEY'];
      originalOpencodeConfig = process.env['NEXUS_OPENCODE_CONFIG'];
      delete process.env['NEXUS_OPENAI_COMPAT_URL'];
      delete process.env['NEXUS_OPENAI_COMPAT_KEY'];
      delete process.env['NEXUS_OPENCODE_CONFIG'];
    });

    afterEach(() => {
      if (originalUrl === undefined) delete process.env['NEXUS_OPENAI_COMPAT_URL'];
      else process.env['NEXUS_OPENAI_COMPAT_URL'] = originalUrl;
      if (originalKey === undefined) delete process.env['NEXUS_OPENAI_COMPAT_KEY'];
      else process.env['NEXUS_OPENAI_COMPAT_KEY'] = originalKey;
      if (originalOpencodeConfig === undefined) delete process.env['NEXUS_OPENCODE_CONFIG'];
      else process.env['NEXUS_OPENCODE_CONFIG'] = originalOpencodeConfig;
    });

    it('reports not configured when neither env var is set', async () => {
      const { checkVoterTransport } = await import('./doctor.js');
      expect(checkVoterTransport()).toEqual({ configured: false });
    });

    it('reports configured when both gateway env vars are set', async () => {
      process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
      process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
      const { checkVoterTransport } = await import('./doctor.js');
      // Previously `toEqual({ configured: true })`; a configured gateway now
      // also carries `cost` (#4392 inc 2), asserted in the describe below.
      expect(checkVoterTransport()).toMatchObject({ configured: true });
    });

    it('reports not configured when only one of the two env vars is set', async () => {
      process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
      const { checkVoterTransport } = await import('./doctor.js');
      expect(checkVoterTransport()).toEqual({ configured: false });
    });

    describe('gateway cost declaration (#4392 inc 2)', () => {
      let originalCost: string | undefined;

      beforeEach(() => {
        originalCost = process.env['NEXUS_GATEWAY_COST'];
        delete process.env['NEXUS_GATEWAY_COST'];
        process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
        process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
      });

      afterEach(() => {
        if (originalCost === undefined) delete process.env['NEXUS_GATEWAY_COST'];
        else process.env['NEXUS_GATEWAY_COST'] = originalCost;
      });

      it('reports cost UNSET when the gateway is configured and the variable is absent', async () => {
        const { checkVoterTransport } = await import('./doctor.js');
        expect(checkVoterTransport()).toEqual({ configured: true, cost: 'unset' });
      });

      it('reports the bare declaration when set', async () => {
        process.env['NEXUS_GATEWAY_COST'] = 'priced:2,10';
        const { checkVoterTransport } = await import('./doctor.js');
        expect(checkVoterTransport()).toEqual({
          configured: true,
          cost: { kind: 'priced', inputPer1M: 2, outputPer1M: 10 },
        });
      });

      it('reports INVALID, not unset, for an unparsable value', async () => {
        process.env['NEXUS_GATEWAY_COST'] = 'priced:1';
        const { checkVoterTransport } = await import('./doctor.js');
        expect(checkVoterTransport()).toEqual({ configured: true, cost: 'invalid' });
      });

      it('reports no-default when the value names neither a bare declaration nor this gateway', async () => {
        // Since step 2 the voter gateway IS an arm (`api:openai-compat` by
        // default); an entry for some OTHER endpoint still leaves it undeclared.
        process.env['NEXUS_GATEWAY_COST'] = 'corp-proxy=free';
        const { checkVoterTransport } = await import('./doctor.js');
        expect(checkVoterTransport()).toEqual({ configured: true, cost: 'no-default' });
      });

      it("reads an entry scoped to the gateway's default endpoint as declared (#4392 step 2)", async () => {
        process.env['NEXUS_GATEWAY_COST'] = 'openai-compat=free';
        const { checkVoterTransport } = await import('./doctor.js');
        expect(checkVoterTransport()).toEqual({ configured: true, cost: { kind: 'free' } });
      });

      it('resolves the scoped entry through NEXUS_OPENAI_COMPAT_ENDPOINT', async () => {
        process.env['NEXUS_OPENAI_COMPAT_ENDPOINT'] = 'corp-proxy';
        process.env['NEXUS_GATEWAY_COST'] = 'corp-proxy=priced:2,10';
        try {
          const { checkVoterTransport } = await import('./doctor.js');
          expect(checkVoterTransport()).toEqual({
            configured: true,
            cost: { kind: 'priced', inputPer1M: 2, outputPer1M: 10 },
          });
        } finally {
          delete process.env['NEXUS_OPENAI_COMPAT_ENDPOINT'];
        }
      });

      it('prefers the scoped entry over the bare default', async () => {
        process.env['NEXUS_GATEWAY_COST'] = 'priced;openai-compat=local';
        const { checkVoterTransport } = await import('./doctor.js');
        expect(checkVoterTransport()).toEqual({ configured: true, cost: { kind: 'local' } });
      });

      it('carries no cost field when no gateway is configured', async () => {
        delete process.env['NEXUS_OPENAI_COMPAT_URL'];
        process.env['NEXUS_GATEWAY_COST'] = 'free';
        const { checkVoterTransport } = await import('./doctor.js');
        expect(checkVoterTransport()).toEqual({ configured: false });
        expect('cost' in checkVoterTransport()).toBe(false);
      });
    });

    describe('deprecated env aliases (#4392 inc 3)', () => {
      const LEGACY = ['NEXUS_CUSTOM_API_BASE_URL', 'NEXUS_CUSTOM_API_KEY'] as const;
      const savedLegacy = new Map<string, string | undefined>();

      beforeEach(() => {
        for (const name of LEGACY) {
          savedLegacy.set(name, process.env[name]);
          Reflect.deleteProperty(process.env, name);
        }
      });

      afterEach(() => {
        for (const name of LEGACY) {
          const prev = savedLegacy.get(name);
          if (prev === undefined) Reflect.deleteProperty(process.env, name);
          else process.env[name] = prev;
        }
      });

      it('the legacy pair alone does NOT configure the voter transport (option C) but is reported', async () => {
        process.env['NEXUS_CUSTOM_API_BASE_URL'] = 'https://gateway.example/v1';
        process.env['NEXUS_CUSTOM_API_KEY'] = 'sk-TESTFAKE-NOT-REAL-0000';
        const { checkVoterTransport } = await import('./doctor.js');
        expect(checkVoterTransport()).toEqual({
          configured: false,
          deprecatedEnv: [
            {
              name: 'NEXUS_CUSTOM_API_BASE_URL',
              replacement: 'NEXUS_OPENAI_COMPAT_URL',
              shadowed: false,
            },
            {
              name: 'NEXUS_CUSTOM_API_KEY',
              replacement: 'NEXUS_OPENAI_COMPAT_KEY',
              shadowed: false,
            },
          ],
        });
      });

      it('marks a legacy name shadowed when the new name is also set, beside a configured gateway', async () => {
        process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
        process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-TESTFAKE-NOT-REAL-0000';
        process.env['NEXUS_CUSTOM_API_KEY'] = 'sk-TESTFAKE-old-NOT-REAL-0000';
        const { checkVoterTransport } = await import('./doctor.js');
        expect(checkVoterTransport()).toMatchObject({
          configured: true,
          deprecatedEnv: [
            {
              name: 'NEXUS_CUSTOM_API_KEY',
              replacement: 'NEXUS_OPENAI_COMPAT_KEY',
              shadowed: true,
            },
          ],
        });
      });

      it('carries no deprecatedEnv field when no legacy name is set', async () => {
        const { checkVoterTransport } = await import('./doctor.js');
        expect('deprecatedEnv' in checkVoterTransport()).toBe(false);
      });
    });
  });
});
