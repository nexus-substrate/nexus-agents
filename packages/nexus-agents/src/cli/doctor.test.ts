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

// Mock the factory module
vi.mock('../cli-adapters/factory.js', () => ({
  createAllAdapters: vi.fn(),
}));

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
import { createServer } from '../mcp/server.js';
import { existsSync } from 'node:fs';

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
      ruleCount: 0,
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
      agentsMdExists: true,
      files: [],
      alignedCount: 0,
      driftCount: 0,
      missingCount: 0,
    },
    voterTransport: { configured: false },
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

      expect(result.allHealthy).toBe(true);
      expect(result.mcpServerReady).toBe(true);
      expect(result.mcpClientReady).toBe(true);
      expect(result.clis).toHaveLength(4);
      expect(result.nodeVersion).toBeDefined();
      expect(result.apiKeys).toHaveLength(3);
      expect(result.configFile).toBeDefined();
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
      expect(output).toContain('22.x');

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
      expect(checkVoterTransport()).toEqual({ configured: true });
    });

    it('reports not configured when only one of the two env vars is set', async () => {
      process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
      const { checkVoterTransport } = await import('./doctor.js');
      expect(checkVoterTransport()).toEqual({ configured: false });
    });
  });
});
