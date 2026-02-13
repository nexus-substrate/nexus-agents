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
        authMethod: 'CLI auth',
      },
      {
        name: 'gemini',
        installed: true,
        version: '0.22.5',
        versionStatus: 'supported',
        authenticated: true,
        authMethod: 'ADC/CLI auth',
      },
      {
        name: 'codex',
        installed: true,
        version: '0.77.0',
        versionStatus: 'supported',
        authenticated: true,
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
      totalModels: 10,
      availableModels: 10,
      unavailableModels: 0,
      models: [],
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
          exhausted: false,
        }),
      };

      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.allHealthy).toBe(true);
      expect(result.mcpServerReady).toBe(true);
      expect(result.mcpClientReady).toBe(true);
      expect(result.clis).toHaveLength(3);
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
              exhausted: false,
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
              exhausted: false,
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
              exhausted: false,
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
              exhausted: false,
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
              exhausted: false,
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
              exhausted: false,
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
              exhausted: false,
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
              exhausted: false,
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
              exhausted: false,
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
          exhausted: false,
        }),
      };
      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
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
              exhausted: false,
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
      // All unavailable should be gemini/codex
      for (const m of unavailableModels) {
        expect(['gemini', 'codex']).toContain(m.cliName);
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
          exhausted: false,
        }),
      };
      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
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
            error: 'Not found in PATH',
            fix: 'npm install -g @anthropic-ai/claude-code',
          },
          {
            name: 'gemini',
            installed: true,
            version: '0.22.5',
            versionStatus: 'supported',
            authenticated: true,
          },
          {
            name: 'codex',
            installed: true,
            version: '0.77.0',
            versionStatus: 'supported',
            authenticated: true,
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
            capacity: {
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              exhausted: false,
            },
          },
          {
            name: 'gemini',
            installed: true,
            version: '0.22.5',
            versionStatus: 'supported',
            authenticated: true,
          },
          {
            name: 'codex',
            installed: true,
            version: '0.77.0',
            versionStatus: 'supported',
            authenticated: true,
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
            error: 'Not found',
          },
          {
            name: 'gemini',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
            error: 'Not found',
          },
          {
            name: 'codex',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
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
          exhausted: false,
        }),
      };

      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
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
          exhausted: false,
        }),
      };

      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const exitCode = await doctorCommand();

      expect(exitCode).toBe(1);
    });
  });
});
