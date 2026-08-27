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

/** Applies a scratchSpace override outside the fixture literal (keeps its complexity under the cap). */
function withScratch(
  override: DoctorResult['scratchSpace'] | undefined,
  base: DoctorResult
): DoctorResult {
  return override === undefined ? base : { ...base, scratchSpace: override };
}

const DEFAULT_SCRATCH_SPACE: DoctorResult['scratchSpace'] = [
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
];

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
      authState?: 'authenticated' | 'unverified' | 'not-authenticated';
    } = {}
  ): CliCheckResult => ({
    name: name as CliName,
    installed,
    authenticated,
    authState: options.authState ?? (authenticated ? 'authenticated' : 'not-authenticated'),
    versionStatus,
    version: options.version ?? '',
    ...(options.authMethod !== undefined && { authMethod: options.authMethod }),
    ...(options.capacity !== undefined && { capacity: options.capacity }),
    ...(options.error !== undefined && { error: options.error }),
    ...(options.fix !== undefined && { fix: options.fix }),
  });

  /** Default freshness for fixtures that do not care about it. */
  const ALIGNED_INSTALL = { state: 'aligned' as const, version: '1.0.0' };

  /** Applied outside the fixture arrow, which is already at its complexity cap. */
  const withInstallFreshness = (
    base: DoctorResult,
    freshness: DoctorResult['installFreshness'] | undefined
  ): DoctorResult => (freshness === undefined ? base : { ...base, installFreshness: freshness });

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
      scratchSpace?: DoctorResult['scratchSpace'];
      installFreshness?: DoctorResult['installFreshness'];
    } = {}
  ): DoctorResult => {
    const base = withScratch(options.scratchSpace, {
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
        // A real doctor run always resolves the standard subdirectory set, and
        // since #4581 the printer no longer calls an unmeasured layout healthy —
        // an empty list here would emit a remediation line the test does not
        // expect, and would be an unrealistic fixture besides.
        subdirectories: [
          {
            name: 'memory',
            path: '/home/test/.nexus-agents/memory',
            scope: 'cross-repo' as const,
            exists: true,
            writable: true,
          },
        ],
      },
      sandbox: {
        active: false,
        flavor: undefined,
        root: undefined,
        heuristicMatch: 'unknown' as const,
        mismatch: false,
        dataDirInsideRepo: false,
      },
      installFreshness: ALIGNED_INSTALL,
      harnessAlignment: {
        agentsMdExists: true,
        files: [],
        alignedCount: 0,
        driftCount: 0,
        missingCount: 0,
      },
      voterTransport: options.voterTransport ?? { configured: false },
      scratchSpace: DEFAULT_SCRATCH_SPACE,
      timestamp: new Date('2024-01-01T00:00:00Z'),
    });
    return withInstallFreshness(base, options.installFreshness);
  };

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

    // #4951 computed the freshness verdict, put it on `DoctorResult`, and
    // nothing printed it — `nexus-agents doctor` showed no line at all. Found
    // by running the command: every unit test asserted the verdict object and
    // none asserted the output (#4959).
    it('prints the global-install drift with both versions', () => {
      printDoctorResults(
        createDoctorResult({
          installFreshness: { state: 'behind', global: '4.3.1', expected: '4.18.0' },
        })
      );

      const out = getCalls().join('');
      expect(out).toContain('4.3.1');
      expect(out).toContain('4.18.0');
    });

    it('prints the restart instruction, not just the update', () => {
      // A remedy stopping at `npm install -g` reports the problem resolved
      // while an already-spawned MCP server keeps the old code.
      printDoctorResults(
        createDoctorResult({
          installFreshness: { state: 'behind', global: '4.3.1', expected: '4.18.0' },
        })
      );

      expect(getCalls().join('')).toContain('RESTART');
    });

    it('prints something for the unknown case rather than staying silent', () => {
      // Silence is what the bug was: an unmeasurable check must still say so.
      printDoctorResults(
        createDoctorResult({ installFreshness: { state: 'unknown', reason: 'not installed' } })
      );

      expect(getCalls().join('')).toMatch(/not determined|cannot confirm/i);
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

    it('does NOT render a zero-subdirectory data layout as healthy (#4581)', () => {
      // `[].every()` is `true`, so an empty subdirectory list made both
      // `allExist` and `allWritable` true and the layout printed with a green
      // check — a healthy verdict over a layout that was never measured. The
      // shared fixture now carries a realistic non-empty list, so this test
      // overrides just that field rather than weakening the fixture.
      const fixture = createDoctorResult();
      const result: DoctorResult = {
        ...fixture,
        dataDirectory: { ...fixture.dataDirectory, rootExists: true, subdirectories: [] },
      };
      printDoctorResults(result);

      const layoutLine = getCalls().find((call) => call.includes('Data directory layout:'));
      expect(layoutLine).toBeDefined();
      expect(layoutLine).not.toContain('\u2713');
      expect(layoutLine).toContain('\u26a0');
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
          rateLimited: tc.util >= 100,
          exhausted: tc.util >= 100,
          quotaExhausted: false,
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
        rateLimited: false,
        exhausted: false,
        quotaExhausted: false,
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
        rateLimited: false,
        exhausted: false,
        quotaExhausted: false,
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

  describe('the summary count agrees with the verdict (#4851)', () => {
    it('does not report zero issues when the verdict is unhealthy', () => {
      // `totalIssues` counted CLIs, node version and mcpServerReady;
      // `isAllHealthy` ALSO fails on an unacceptable scratch severity. So a
      // critical scratch filesystem with everything else fine printed
      // "Summary: 0 issue(s) found" — a summary shown only because something
      // is wrong, saying nothing is wrong.
      const result = createDoctorResult({
        allHealthy: false,
        scratchSpace: [
          {
            label: 'system' as const,
            root: '/tmp',
            available: true,
            freeBytes: 0,
            totalBytes: 34_359_738_368,
            percentUsed: 100,
            severity: 'critical' as const,
            message: '/tmp is full',
          },
        ],
      });

      printDoctorResults(result);

      const calls = getCalls();
      expect(calls.some((call) => call.includes('0 issue(s) found'))).toBe(false);
      expect(calls.some((call) => call.includes('1 issue(s) found'))).toBe(true);
    });

    it('still counts the CLI, node and MCP issues it always did', () => {
      // The pair: the scratch term must add to the count, not replace it.
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

      expect(getCalls().some((call) => call.includes('4 issue(s) found'))).toBe(true);
    });
  });

  describe('an unverified auth probe is not a failed one (#4661)', () => {
    it('renders "unverified" rather than "Not authenticated"', () => {
      // The probe for this CLI can only ever return `unknown` — the gateway
      // exposes no non-interactive auth check, so nothing was measured. Routing
      // admits that state deliberately (#4391); doctor collapsed it to a red
      // negative, and told the operator to re-auth a CLI that was working.
      const result = createDoctorResult({
        clis: [
          createCliCheckResult('gemini', true, false, 'supported', {
            version: '1.1.19',
            authState: 'unverified',
          }),
        ],
      });
      printDoctorResults(result);

      const calls = getCalls();
      expect(calls.some((c) => c.includes('unverified'))).toBe(true);
      expect(calls.some((c) => c.includes('Not authenticated'))).toBe(false);
    });

    it('still renders a genuine needs-login as "Not authenticated"', () => {
      // The distinction has to survive both ways round, or this fix just moves
      // the misreport rather than removing it.
      const result = createDoctorResult({
        clis: [
          createCliCheckResult('claude', true, false, 'supported', {
            version: '0.2.0',
            authState: 'not-authenticated',
          }),
        ],
      });
      printDoctorResults(result);

      expect(getCalls().some((c) => c.includes('Not authenticated'))).toBe(true);
    });
  });
});
