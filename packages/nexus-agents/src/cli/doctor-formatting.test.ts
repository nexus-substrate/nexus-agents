/**
 * Unit tests for doctor-formatting module
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { printDoctorResults } from './doctor-formatting.js';
import type {
  DoctorResult,
  NodeVersionCheck,
  ApiKeyCheck,
  ConfigFileCheck,
  CliCheckResult,
} from './doctor.js';
import type { CliName } from '../cli-adapters/index.js';
import * as ansiOutput from './ansi-output.js';
import type { CapacityStatus } from '../cli-adapters/types.js';

// Mock ansi-output module
vi.mock('./ansi-output.js', () => ({
  colors: {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
  },
  symbols: {
    check: '✓',
    cross: '✗',
    warn: '⚠',
  },
  writeLine: vi.fn(),
}));

// Mock text-utils module
vi.mock('../utils/text-utils.js', () => ({
  capitalize: (str: string): string => str.charAt(0).toUpperCase() + str.slice(1),
}));

// Mock DEFAULT_CAPABILITIES
vi.mock('../cli-adapters/types.js', () => ({
  DEFAULT_CAPABILITIES: {
    claude: {
      reasoning: 95,
      contextWindow: 200000,
      speed: 70,
      quality: 90,
      costPerMToken: 15,
    },
    codex: {
      reasoning: 85,
      contextWindow: 128000,
      speed: 85,
      quality: 85,
      costPerMToken: 10,
    },
    gemini: {
      reasoning: 80,
      contextWindow: 1000000,
      speed: 90,
      quality: 80,
      costPerMToken: 5,
    },
  },
}));

describe('doctor-formatting', () => {
  let writeLineMock: MockedFunction<typeof ansiOutput.writeLine>;

  /** Get all writeLine calls as flat string array for assertion convenience. */
  function getCalls(): string[] {
    return writeLineMock.mock.calls.flat().filter((c): c is string => typeof c === 'string');
  }

  beforeEach(() => {
    writeLineMock = ansiOutput.writeLine as MockedFunction<typeof ansiOutput.writeLine>;
    writeLineMock.mockClear();
  });

  const createNodeVersionCheck = (supported: boolean, version: string): NodeVersionCheck => ({
    supported,
    version,
    major: Number.parseInt(version.replace('v', '').split('.')[0]!, 10),
  });

  const createApiKeyCheck = (name: string, configured: boolean): ApiKeyCheck => ({
    name,
    configured,
  });

  const createConfigFileCheck = (found: boolean, path: string | null): ConfigFileCheck => ({
    found,
    path,
  });

  const createCliCheckResult = (
    name: string,
    installed: boolean,
    authenticated: boolean,
    versionStatus: 'supported' | 'outdated' | 'breaking' | 'unsupported',
    options: {
      version?: string;
      authMethod?: string;
      capacity?: CapacityStatus;
      error?: string;
      fix?: string;
    } = {}
  ): CliCheckResult => ({
    name: name as CliName,
    installed,
    authenticated,
    versionStatus,
    version: options.version ?? '',
    ...(options.authMethod !== undefined && { authMethod: options.authMethod }),
    ...(options.capacity !== undefined && { capacity: options.capacity }),
    ...(options.error !== undefined && { error: options.error }),
    ...(options.fix !== undefined && { fix: options.fix }),
  });

  const createDoctorResult = (
    options: {
      allHealthy?: boolean;
      nodeVersion?: NodeVersionCheck;
      apiKeys?: ApiKeyCheck[];
      configFile?: ConfigFileCheck;
      clis?: CliCheckResult[];
      mcpServerReady?: boolean;
      mcpClientReady?: boolean;
      voterTransport?: { configured: boolean };
    } = {}
  ): DoctorResult => ({
    allHealthy: options.allHealthy ?? true,
    nodeVersion: options.nodeVersion ?? createNodeVersionCheck(true, 'v22.0.0'),
    apiKeys: options.apiKeys ?? [],
    configFile: options.configFile ?? createConfigFileCheck(true, './nexus-agents.yaml'),
    clis: options.clis ?? [],
    mcpServerReady: options.mcpServerReady ?? true,
    mcpClientReady: options.mcpClientReady ?? true,
    registryAdvisory: {
      totalModels: 10,
      availableModels: 10,
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
    harnessAlignment: {
      agentsMdExists: true,
      files: [],
      alignedCount: 0,
      driftCount: 0,
      missingCount: 0,
    },
    voterTransport: options.voterTransport ?? { configured: false },
    timestamp: new Date('2024-01-01T00:00:00Z'),
  });

  describe('printDoctorResults', () => {
    it('should print header and section titles', () => {
      const result = createDoctorResult();
      printDoctorResults(result);

      const calls = getCalls();
      expect(calls.some((call) => call.includes('Nexus Agents Doctor'))).toBe(true);
      expect(calls.some((call) => call.includes('Checking environment'))).toBe(true);
      expect(calls.some((call) => call.includes('Checking CLI installations'))).toBe(true);
      expect(calls.some((call) => call.includes('Checking MCP configuration'))).toBe(true);
      expect(calls.some((call) => call.includes('Checking capabilities'))).toBe(true);
      expect(calls.some((call) => call.includes('Checking data storage'))).toBe(true);
    });

    it('should print healthy status when all checks pass', () => {
      const result = createDoctorResult({
        allHealthy: true,
        clis: [createCliCheckResult('claude', true, true, 'supported', { version: '0.2.0' })],
      });
      printDoctorResults(result);

      const calls = getCalls();
      expect(calls.some((call) => call.includes('Status: Ready'))).toBe(true);
    });

    it('should print issues summary when checks fail', () => {
      const result = createDoctorResult({
        allHealthy: false,
        nodeVersion: createNodeVersionCheck(false, 'v18.0.0'),
        clis: [createCliCheckResult('claude', false, false, 'unsupported')],
        mcpServerReady: false,
      });
      printDoctorResults(result);

      const calls = getCalls();
      expect(calls.some((call) => call.includes('issue(s) found'))).toBe(true);
    });

    it('should print Node.js version with correct status', () => {
      const testCases = [
        { supported: true, version: 'v22.1.0', color: '\x1b[32m', warning: false },
        { supported: false, version: 'v18.0.0', color: '\x1b[33m', warning: true },
      ];

      for (const tc of testCases) {
        writeLineMock.mockClear();
        const result = createDoctorResult({
          nodeVersion: createNodeVersionCheck(tc.supported, tc.version),
        });
        printDoctorResults(result);
        const calls = getCalls();
        const nodeCall = calls.find((call) => call.includes('Node.js version'));
        expect(nodeCall).toBeDefined();
        expect(nodeCall).toContain(tc.color);
        expect(nodeCall).toContain(tc.version);
        if (tc.warning)
          expect(calls.some((call) => call.includes('Node.js 22.x LTS required'))).toBe(true);
      }
    });

    it('should print API keys status correctly', () => {
      const testCases = [
        {
          keys: [
            createApiKeyCheck('ANTHROPIC_API_KEY', true),
            createApiKeyCheck('OPENAI_API_KEY', false),
          ],
          expectCount: '1 of 2',
          expectKey: 'ANTHROPIC_API_KEY',
          expectWarning: false,
        },
        {
          keys: [
            createApiKeyCheck('ANTHROPIC_API_KEY', false),
            createApiKeyCheck('OPENAI_API_KEY', false),
          ],
          expectCount: '0 of 2',
          expectKey: '',
          expectWarning: true,
        },
      ];

      for (const tc of testCases) {
        writeLineMock.mockClear();
        const result = createDoctorResult({ apiKeys: tc.keys });
        printDoctorResults(result);
        const calls = getCalls();
        expect(calls.some((call) => call.includes(`API keys configured: ${tc.expectCount}`))).toBe(
          true
        );
        if (tc.expectKey !== '')
          expect(calls.some((call) => call.includes(tc.expectKey))).toBe(true);
        if (tc.expectWarning)
          expect(calls.some((call) => call.includes('Set ANTHROPIC_API_KEY'))).toBe(true);
      }
    });

    it('should print config file status correctly', () => {
      const testCases = [
        {
          found: true,
          path: './nexus-agents.yaml',
          expectFound: 'Configuration loaded: ./nexus-agents.yaml',
          expectInit: false,
        },
        {
          found: false,
          path: null,
          expectFound: 'Configuration file: Not found',
          expectInit: true,
        },
      ];

      for (const tc of testCases) {
        writeLineMock.mockClear();
        const result = createDoctorResult({ configFile: createConfigFileCheck(tc.found, tc.path) });
        printDoctorResults(result);
        const calls = getCalls();
        expect(calls.some((call) => call.includes(tc.expectFound))).toBe(true);
        if (tc.expectInit)
          expect(calls.some((call) => call.includes('nexus-agents config init'))).toBe(true);
      }
    });

    it('should print installed CLI with green status', () => {
      const result = createDoctorResult({
        clis: [
          createCliCheckResult('claude', true, true, 'supported', {
            version: '0.2.0',
            authMethod: 'API Key',
          }),
        ],
      });
      printDoctorResults(result);

      const calls = getCalls();
      expect(calls.some((call) => call.includes('Claude CLI'))).toBe(true);
      expect(calls.some((call) => call.includes('Version: 0.2.0'))).toBe(true);
      expect(calls.some((call) => call.includes('supported'))).toBe(true);
      expect(calls.some((call) => call.includes('API Key'))).toBe(true);
    });

    it('should print CLI warnings and errors correctly', () => {
      const testCases = [
        {
          cli: createCliCheckResult('claude', true, true, 'outdated', { version: '0.1.0' }),
          expect: 'outdated',
          color: '\x1b[33m',
        },
        {
          cli: createCliCheckResult('claude', true, false, 'supported', { version: '0.2.0' }),
          expect: 'Not authenticated',
          color: '',
        },
      ];

      for (const tc of testCases) {
        writeLineMock.mockClear();
        const result = createDoctorResult({ clis: [tc.cli] });
        printDoctorResults(result);
        const calls = getCalls();
        expect(calls.some((call) => call.includes(tc.expect))).toBe(true);
        if (tc.color !== '')
          expect(calls.some((call) => call.includes(tc.expect) && call.includes(tc.color))).toBe(
            true
          );
      }
    });

    it('should print CLI error when not installed', () => {
      const result = createDoctorResult({
        clis: [
          createCliCheckResult('claude', false, false, 'unsupported', {
            error: 'Command not found',
            fix: 'npm install -g @anthropic-ai/claude-code',
          }),
        ],
      });
      printDoctorResults(result);

      const calls = getCalls();
      expect(calls.some((call) => call.includes('Command not found'))).toBe(true);
      expect(calls.some((call) => call.includes('npm install -g @anthropic-ai/claude-code'))).toBe(
        true
      );
    });

    it('should print CLI capacity with correct color based on level', () => {
      const testCases = [
        { util: 10, expected: '90% remaining', desc: 'high' },
        { util: 60, expected: '40% remaining', desc: 'medium' },
        { util: 95, expected: '5% remaining', desc: 'low' },
      ];

      for (const tc of testCases) {
        writeLineMock.mockClear();
        const capacity: CapacityStatus = {
          remainingTokens: (100 - tc.util) * 1000,
          remainingRequests: 100,
          resetTime: new Date(),
          utilizationPercent: tc.util,
          exhausted: tc.util >= 100,
          // #4374: these cases assert the percentage banding, which only applies
          // to a reading we actually measured.
          observed: true,
        };
        const result = createDoctorResult({
          clis: [
            createCliCheckResult('claude', true, true, 'supported', { version: '0.2.0', capacity }),
          ],
        });
        printDoctorResults(result);
        const calls = getCalls();
        expect(
          calls.some((call) => call.includes(tc.expected)),
          `${tc.desc} capacity`
        ).toBe(true);
      }
    });

    // #4374: a tracker that has never recorded a request returns the full token
    // limit and 0% utilization — a default, not a measurement — and doctor
    // rendered it as a green "100% remaining". That reading is fiction for a CLI
    // whose weekly quota was consumed by another process, and it is what made
    // the #4351 reproduction confusing.
    it('does not report unobserved capacity as 100% remaining', () => {
      const capacity: CapacityStatus = {
        remainingTokens: 100_000,
        remainingRequests: 100,
        resetTime: new Date(),
        utilizationPercent: 0,
        exhausted: false,
        observed: false,
      };
      const result = createDoctorResult({
        clis: [
          createCliCheckResult('claude', true, true, 'supported', { version: '0.2.0', capacity }),
        ],
      });

      printDoctorResults(result);

      const calls = getCalls();
      expect(calls.some((call) => call.includes('100% remaining'))).toBe(false);
      expect(calls.some((call) => call.includes('unknown'))).toBe(true);
    });

    it('still reports an observed idle adapter as 100% remaining', () => {
      const capacity: CapacityStatus = {
        remainingTokens: 100_000,
        remainingRequests: 100,
        resetTime: new Date(),
        utilizationPercent: 0,
        exhausted: false,
        observed: true,
      };
      const result = createDoctorResult({
        clis: [
          createCliCheckResult('claude', true, true, 'supported', { version: '0.2.0', capacity }),
        ],
      });

      printDoctorResults(result);

      expect(getCalls().some((call) => call.includes('100% remaining'))).toBe(true);
    });

    it('should print MCP server and client status', () => {
      const testCases = [
        {
          server: true,
          client: true,
          serverExpect: 'MCP Server mode: Ready',
          clientExpect: 'MCP Client mode: Ready',
        },
        {
          server: false,
          client: false,
          serverExpect: 'MCP Server mode: Not ready',
          clientExpect: 'MCP Client mode: Not ready',
        },
      ];

      for (const tc of testCases) {
        writeLineMock.mockClear();
        const result = createDoctorResult({ mcpServerReady: tc.server, mcpClientReady: tc.client });
        printDoctorResults(result);
        const calls = getCalls();
        expect(calls.some((call) => call.includes(tc.serverExpect))).toBe(true);
        expect(calls.some((call) => call.includes(tc.clientExpect))).toBe(true);
      }
    });

    it('should print voter transport status (#4255)', () => {
      const testCases = [
        { configured: true, expected: 'Voter transport: In-process gateway' },
        { configured: false, expected: 'Voter transport:' },
      ];

      for (const tc of testCases) {
        writeLineMock.mockClear();
        const result = createDoctorResult({ voterTransport: { configured: tc.configured } });
        printDoctorResults(result);
        const calls = getCalls();
        expect(calls.some((call) => call.includes(tc.expected))).toBe(true);
        if (!tc.configured) {
          expect(calls.some((call) => call.includes('NEXUS_OPENAI_COMPAT_URL'))).toBe(true);
        }
      }
    });

    it('should print capabilities for multiple installed CLIs', () => {
      const result = createDoctorResult({
        clis: [
          createCliCheckResult('claude', true, true, 'supported', { version: '0.2.0' }),
          createCliCheckResult('codex', true, true, 'supported', { version: '0.1.0' }),
          createCliCheckResult('gemini', true, true, 'supported', { version: '1.0.0' }),
        ],
      });
      printDoctorResults(result);

      const calls = getCalls();
      // Note: output includes ANSI codes like \x1b[1m for bold
      expect(
        calls.some((call) => call.includes('Complex reasoning:') && call.includes('Claude'))
      ).toBe(true);
      expect(calls.some((call) => call.includes('Large context:') && call.includes('Gemini'))).toBe(
        true
      );
      expect(
        calls.some((call) => call.includes('Fast execution:') && call.includes('Gemini'))
      ).toBe(true);
    });

    it('should print no CLIs installed message when none installed', () => {
      const result = createDoctorResult({
        clis: [
          createCliCheckResult('claude', false, false, 'unsupported'),
          createCliCheckResult('codex', false, false, 'unsupported'),
        ],
      });
      printDoctorResults(result);

      const calls = getCalls();
      expect(calls.some((call) => call.includes('No CLIs installed'))).toBe(true);
    });

    it('should handle optional CLI fields correctly', () => {
      const testCases = [
        {
          cli: createCliCheckResult('claude', true, true, 'supported', { version: '0.2.0' }),
          noExpect: 'Capacity:',
          expect: '',
          color: '',
        },
        {
          cli: createCliCheckResult('claude', false, false, 'unsupported', {
            error: 'Not installed',
          }),
          noExpect: 'Fix:',
          expect: '',
          color: '',
        },
        {
          cli: createCliCheckResult('claude', true, true, 'breaking', { version: '2.0.0' }),
          noExpect: '',
          expect: 'breaking',
          color: '\x1b[31m',
        },
      ];

      for (const tc of testCases) {
        writeLineMock.mockClear();
        const result = createDoctorResult({ clis: [tc.cli] });
        printDoctorResults(result);
        const calls = getCalls();
        if (tc.noExpect !== '')
          expect(calls.some((call) => call.includes(tc.noExpect))).toBe(false);
        if (tc.expect !== '' && tc.color !== '')
          expect(calls.some((call) => call.includes(tc.expect) && call.includes(tc.color))).toBe(
            true
          );
      }
    });

    it('should calculate correct issue count', () => {
      const result = createDoctorResult({
        allHealthy: false,
        nodeVersion: createNodeVersionCheck(false, 'v18.0.0'),
        clis: [
          createCliCheckResult('claude', false, false, 'unsupported'),
          createCliCheckResult('codex', true, false, 'supported', { version: '0.1.0' }),
        ],
        mcpServerReady: false,
      });
      printDoctorResults(result);

      const calls = getCalls();
      // 2 unhealthy CLIs + 1 Node issue + 1 MCP issue = 4 total
      expect(calls.some((call) => call.includes('4 issue(s) found'))).toBe(true);
    });
  });
});
