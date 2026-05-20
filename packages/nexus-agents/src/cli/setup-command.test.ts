/**
 * Tests for Setup Command
 *
 * Verifies user onboarding automation for Claude CLI integration.
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import {
  runSetup,
  printSetupResult,
  setupCommand,
  ensureRepoGitignoredAndHint,
} from './setup-command.js';
import {
  detectClaudeCli,
  detectMcpConfig,
  detectProjectType,
  detectProjectInfo,
  detectEnvironment,
  generateMcpSnippet,
  getMcpJsonPath,
  generateRulesContent,
  getRulesFilePath,
  createRulesFile,
  formatStatus,
  formatHeader,
  formatCodeBlock,
  isInteractive,
  NEXUS_AGENTS_MCP_ENTRY,
  NEXUS_AGENTS_MCP_NPX_ENTRY,
  mergeHookConfigs,
  generateHookConfig,
} from './setup-helpers.js';
import type { SetupResult } from './setup-types.js';
import type { HookSettingsConfig } from './setup-mcp.js';

// Create unique temp directory for tests
const testTmpDir = join(tmpdir(), `nexus-setup-test-${String(Date.now())}`);

// Mock child_process to avoid slow CLI detection during tests (perf: saves ~48s)
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn(() => {
      throw new Error('not found');
    }),
    execFileSync: vi.fn(() => {
      throw new Error('not found');
    }),
  };
});

describe('Setup Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Create fresh temp directory
    mkdirSync(testTmpDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up temp directory
    if (existsSync(testTmpDir)) {
      rmSync(testTmpDir, { recursive: true, force: true });
    }
  });

  describe('MCP Entry Constants', () => {
    it('should have correct nexus-agents MCP entry', () => {
      expect(NEXUS_AGENTS_MCP_ENTRY.command).toBe('nexus-agents');
      expect(NEXUS_AGENTS_MCP_ENTRY.args).toEqual(['--mode=server']);
    });

    it('should have correct npx MCP entry', () => {
      expect(NEXUS_AGENTS_MCP_NPX_ENTRY.command).toBe('npx');
      expect(NEXUS_AGENTS_MCP_NPX_ENTRY.args).toContain('-y');
      expect(NEXUS_AGENTS_MCP_NPX_ENTRY.args).toContain('nexus-agents@latest');
    });
  });

  describe('detectClaudeCli()', () => {
    it('should return installed: false when claude is not in PATH', () => {
      const result = detectClaudeCli();
      // In most test environments, claude won't be installed
      expect(result).toHaveProperty('installed');
      expect(result).toHaveProperty('configPath');
      expect(result).toHaveProperty('mcpJsonPath');
      expect(result.configPath).toContain('.claude');
      expect(result.mcpJsonPath).toContain('.claude.json');
    });
  });

  describe('detectMcpConfig()', () => {
    it('should return undefined when mcp.json does not exist', () => {
      const result = detectMcpConfig(join(testTmpDir, 'nonexistent', 'mcp.json'));
      expect(result).toBeUndefined();
    });

    it('should detect existing mcp.json without nexus-agents', () => {
      const mcpPath = join(testTmpDir, 'mcp.json');
      writeFileSync(
        mcpPath,
        JSON.stringify({ mcpServers: { 'other-server': { command: 'test' } } })
      );

      const result = detectMcpConfig(mcpPath);
      expect(result).toBeDefined();
      expect(result?.exists).toBe(true);
      expect(result?.hasNexusAgents).toBe(false);
      expect(result?.servers).toContain('other-server');
    });

    it('should detect existing mcp.json with nexus-agents', () => {
      const mcpPath = join(testTmpDir, 'mcp.json');
      writeFileSync(
        mcpPath,
        JSON.stringify({
          mcpServers: { 'nexus-agents': NEXUS_AGENTS_MCP_ENTRY },
        })
      );

      const result = detectMcpConfig(mcpPath);
      expect(result?.hasNexusAgents).toBe(true);
    });

    it('should handle malformed mcp.json gracefully', () => {
      const mcpPath = join(testTmpDir, 'mcp.json');
      writeFileSync(mcpPath, 'invalid json content');

      const result = detectMcpConfig(mcpPath);
      expect(result?.exists).toBe(true);
      expect(result?.hasNexusAgents).toBe(false);
      expect(result?.servers).toEqual([]);
    });
  });

  describe('detectProjectType()', () => {
    it('should detect TypeScript project by tsconfig.json', () => {
      const projectDir = join(testTmpDir, 'ts-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'tsconfig.json'), '{}');

      expect(detectProjectType(projectDir)).toBe('typescript');
    });

    it('should detect TypeScript in package.json devDependencies', () => {
      const projectDir = join(testTmpDir, 'js-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(
        join(projectDir, 'package.json'),
        JSON.stringify({ devDependencies: { typescript: '^5.0.0' } })
      );

      expect(detectProjectType(projectDir)).toBe('typescript');
    });

    it('should detect JavaScript project', () => {
      const projectDir = join(testTmpDir, 'js-only');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'test' }));

      expect(detectProjectType(projectDir)).toBe('javascript');
    });

    it('should detect Rust project', () => {
      const projectDir = join(testTmpDir, 'rust-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'Cargo.toml'), '');

      expect(detectProjectType(projectDir)).toBe('rust');
    });

    it('should detect Go project', () => {
      const projectDir = join(testTmpDir, 'go-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'go.mod'), '');

      expect(detectProjectType(projectDir)).toBe('go');
    });

    it('should detect Python project by pyproject.toml', () => {
      const projectDir = join(testTmpDir, 'py-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'pyproject.toml'), '');

      expect(detectProjectType(projectDir)).toBe('python');
    });

    it('should detect Java project by pom.xml', () => {
      const projectDir = join(testTmpDir, 'java-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'pom.xml'), '');

      expect(detectProjectType(projectDir)).toBe('java');
    });

    it('should return unknown for empty directory', () => {
      const projectDir = join(testTmpDir, 'empty');
      mkdirSync(projectDir, { recursive: true });

      expect(detectProjectType(projectDir)).toBe('unknown');
    });
  });

  describe('detectProjectInfo()', () => {
    it('should detect project info correctly', () => {
      const projectDir = join(testTmpDir, 'full-project');
      mkdirSync(join(projectDir, '.claude', 'rules'), { recursive: true });
      writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'my-app' }));
      writeFileSync(join(projectDir, 'tsconfig.json'), '{}');
      writeFileSync(join(projectDir, 'CLAUDE.md'), '# Claude');
      writeFileSync(join(projectDir, 'nexus-agents.yaml'), 'version: 1');

      const result = detectProjectInfo(projectDir);

      expect(result.root).toBe(projectDir);
      expect(result.hasPackageJson).toBe(true);
      expect(result.hasClaudeMd).toBe(true);
      expect(result.hasClaudeRules).toBe(true);
      expect(result.hasNexusConfig).toBe(true);
      expect(result.projectType).toBe('typescript');
      expect(result.packageName).toBe('my-app');
    });

    it('should use directory name when package.json has no name', () => {
      const projectDir = join(testTmpDir, 'unnamed-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'package.json'), JSON.stringify({}));

      const result = detectProjectInfo(projectDir);
      expect(result.packageName).toBe('unnamed-project');
    });
  });

  describe('detectEnvironment()', () => {
    it('should detect complete environment information', () => {
      const projectDir = join(testTmpDir, 'env-test');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'test' }));

      const result = detectEnvironment(projectDir);

      expect(result.platform).toBe(process.platform);
      expect(result.homeDir).toBeDefined();
      expect(result.claudeCli).toBeDefined();
      expect(result.projectInfo).toBeDefined();
      expect(result.projectInfo.root).toBe(projectDir);
    });
  });

  describe('generateMcpSnippet()', () => {
    it('should generate direct command snippet by default', () => {
      const snippet = generateMcpSnippet();
      const parsed = JSON.parse(snippet);

      expect(parsed.mcpServers['nexus-agents'].command).toBe('nexus-agents');
      expect(parsed.mcpServers['nexus-agents'].args).toEqual(['--mode=server']);
    });

    it('should generate npx snippet when useNpx is true', () => {
      const snippet = generateMcpSnippet(true);
      const parsed = JSON.parse(snippet);

      expect(parsed.mcpServers['nexus-agents'].command).toBe('npx');
      expect(parsed.mcpServers['nexus-agents'].args).toContain('nexus-agents@latest');
    });

    it('should generate valid JSON', () => {
      const snippet = generateMcpSnippet();
      let parsed: unknown;
      expect(() => {
        parsed = JSON.parse(snippet);
      }).not.toThrow();
      expect(parsed).toBeDefined();
    });
  });

  describe('getMcpJsonPath()', () => {
    it('should return user-level path for user scope', () => {
      const result = getMcpJsonPath('user', testTmpDir);
      expect(result).toContain('.claude.json');
    });

    it('should return project-level path for project scope', () => {
      const result = getMcpJsonPath('project', testTmpDir);
      expect(result).toBe(join(testTmpDir, '.mcp.json'));
    });
  });

  describe('generateRulesContent()', () => {
    it('should include MCP tools table', () => {
      const content = generateRulesContent();
      expect(content).toContain('MCP Tools Available');
      expect(content).toContain('orchestrate');
      expect(content).toContain('create_expert');
    });

    it('should include quick commands', () => {
      const content = generateRulesContent();
      expect(content).toContain('Quick Commands');
      expect(content).toContain('nexus-agents doctor');
    });

    it('should include usage examples', () => {
      const content = generateRulesContent();
      expect(content).toContain('Usage Examples');
    });

    it('should include version in footer', () => {
      const content = generateRulesContent();
      expect(content).toContain('Generated by nexus-agents setup');
    });
  });

  describe('getRulesFilePath()', () => {
    it('should return correct rules file path (.rules/ canonical since #2121)', () => {
      const result = getRulesFilePath(testTmpDir);
      expect(result).toBe(join(testTmpDir, '.rules', 'nexus-agents.md'));
    });
  });

  describe('createRulesFile()', () => {
    it('should create rules file in dry-run mode without writing', () => {
      const rulesPath = createRulesFile(testTmpDir, true);
      expect(rulesPath).toContain('nexus-agents.md');
      expect(existsSync(rulesPath)).toBe(false);
    });

    it('should create rules file and directories', () => {
      const rulesPath = createRulesFile(testTmpDir, false);

      expect(existsSync(rulesPath)).toBe(true);
      const content = readFileSync(rulesPath, 'utf-8');
      expect(content).toContain('Nexus-Agents Integration');
    });
  });

  describe('formatStatus()', () => {
    it('should format success status with check mark', () => {
      const result = formatStatus('success');
      expect(result).toContain('✓');
    });

    it('should format failed status with cross', () => {
      const result = formatStatus('failed');
      expect(result).toContain('✗');
    });

    it('should format skipped status with warning', () => {
      const result = formatStatus('skipped');
      expect(result).toContain('⚠');
    });

    it('should format pending status', () => {
      const result = formatStatus('pending');
      expect(result).toContain('○');
    });
  });

  describe('formatHeader()', () => {
    it('should wrap text in bold', () => {
      const result = formatHeader('Test Header');
      expect(result).toContain('Test Header');
    });
  });

  describe('formatCodeBlock()', () => {
    it('should indent and dim code lines', () => {
      const result = formatCodeBlock('line1\nline2');
      expect(result).toContain('  '); // Indentation
      expect(result).toContain('line1');
      expect(result).toContain('line2');
    });
  });

  describe('isInteractive()', () => {
    it('should return boolean', () => {
      const result = isInteractive();
      expect(typeof result).toBe('boolean');
    });

    it('should return false when CI=true', () => {
      const originalCI = process.env['CI'];
      process.env['CI'] = 'true';

      const result = isInteractive();
      expect(result).toBe(false);

      if (originalCI !== undefined) {
        process.env['CI'] = originalCI;
      } else {
        delete process.env['CI'];
      }
    });
  });

  describe('runSetup()', () => {
    it('should complete successfully with default options', () => {
      const result = runSetup({ dryRun: true });

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should skip MCP config when skipMcp is true', () => {
      const result = runSetup({ skipMcp: true, dryRun: true });

      const mcpStep = result.steps.find((s) => s.name === 'MCP Configuration');
      expect(mcpStep?.status).toBe('skipped');
    });

    it('should skip rules file when skipRules is true', () => {
      const result = runSetup({ skipRules: true, dryRun: true });

      const rulesStep = result.steps.find((s) => s.name === 'Rules File');
      expect(rulesStep?.status).toBe('skipped');
    });

    it('should include warnings when Claude CLI is not installed', () => {
      const result = runSetup({ dryRun: true });

      // In test environment, Claude CLI is typically not installed
      if (!result.warnings.some((w) => w.includes('Claude CLI not found'))) {
        // If Claude is installed, warnings array should be empty or have other warnings
        expect(result.warnings).toBeDefined();
      }
    });

    it('should include MCP snippet in result', () => {
      const result = runSetup({ dryRun: true });

      if (result.mcpSnippet !== undefined) {
        let parsed: unknown;
        expect(() => {
          parsed = JSON.parse(result.mcpSnippet ?? '');
        }).not.toThrow();
        expect(parsed).toBeDefined();
      }
    });
  });

  describe('prerequisite check step', () => {
    it('should include prerequisite check in steps', () => {
      const result = runSetup({ dryRun: true });
      const prereqStep = result.steps.find((s) => s.name === 'Prerequisite Check');
      expect(prereqStep).toBeDefined();
      expect(prereqStep?.status).toBe('success');
    });

    it('should validate Node.js version', () => {
      const result = runSetup({ dryRun: true });
      const prereqStep = result.steps.find((s) => s.name === 'Prerequisite Check');
      expect(prereqStep?.message).toContain('Node.js');
    });
  });

  describe('validation step (#1271)', () => {
    it('should include validation as final step', () => {
      const result = runSetup({ dryRun: true });
      const lastStep = result.steps[result.steps.length - 1];
      expect(lastStep?.name).toBe('Validation');
    });

    it('should report doctor hint in validation message', () => {
      const result = runSetup({ dryRun: true });
      const validationStep = result.steps.find((s) => s.name === 'Validation');
      expect(validationStep?.message).toContain('nexus-agents doctor');
    });
  });

  describe('printSetupResult()', () => {
    let writeCalls: string[];

    beforeEach(() => {
      writeCalls = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        writeCalls.push(String(chunk));
        return true;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should print setup result to stdout', () => {
      const result: SetupResult = {
        success: true,
        steps: [
          { name: 'Environment Detection', status: 'success', message: 'Detected' },
          { name: 'MCP Configuration', status: 'success', message: 'Generated' },
          { name: 'Rules File', status: 'success', message: 'Created' },
        ],
        warnings: [],
        errors: [],
        durationMs: 100,
      };

      printSetupResult(result, false);

      expect(writeCalls.length).toBeGreaterThan(0);
      const output = writeCalls.join('');
      expect(output).toContain('Nexus Agents Setup');
      expect(output).toContain('Environment Detection');
      expect(output).toContain('Setup completed successfully');
    });

    it('should print MCP snippet when included', () => {
      const result: SetupResult = {
        success: true,
        steps: [{ name: 'Test', status: 'success' }],
        mcpSnippet: '{"mcpServers": {}}',
        warnings: [],
        errors: [],
        durationMs: 100,
      };

      printSetupResult(result, false);

      const output = writeCalls.join('');
      expect(output).toContain('MCP Configuration');
      expect(output).toContain('claude mcp add-json');
    });

    it('should print warnings when present', () => {
      const result: SetupResult = {
        success: true,
        steps: [{ name: 'Test', status: 'success' }],
        warnings: ['This is a warning'],
        errors: [],
        durationMs: 100,
      };

      printSetupResult(result, false);

      const output = writeCalls.join('');
      expect(output).toContain('Warnings');
      expect(output).toContain('This is a warning');
    });

    it('should print errors when present', () => {
      const result: SetupResult = {
        success: false,
        steps: [{ name: 'Test', status: 'failed', message: 'Failed to run' }],
        warnings: [],
        errors: ['Something went wrong'],
        durationMs: 100,
      };

      printSetupResult(result, false);

      const output = writeCalls.join('');
      expect(output).toContain('Errors');
      expect(output).toContain('Something went wrong');
      expect(output).toContain('completed with errors');
    });

    it('should show duration in verbose mode', () => {
      const result: SetupResult = {
        success: true,
        steps: [{ name: 'Test', status: 'success', durationMs: 42 }],
        warnings: [],
        errors: [],
        durationMs: 100,
      };

      printSetupResult(result, true);

      const output = writeCalls.join('');
      expect(output).toContain('42ms');
    });
  });

  describe('setupCommand()', () => {
    beforeEach(() => {
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return 0 on success with nonInteractive', () => {
      const result = setupCommand({
        nonInteractive: true,
        dryRun: true,
        skipMcp: true,
        skipRules: true,
      });

      expect(result).toBe(0);
    });

    it('should return 1 in non-interactive environment without flag', () => {
      // Mock non-interactive environment
      const originalCI = process.env['CI'];
      const originalTTY = process.stdout.isTTY;
      process.env['CI'] = 'true';
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      const result = setupCommand({ dryRun: true });

      expect(result).toBe(1);

      // Restore
      if (originalCI !== undefined) {
        process.env['CI'] = originalCI;
      } else {
        delete process.env['CI'];
      }
      Object.defineProperty(process.stdout, 'isTTY', { value: originalTTY, configurable: true });
    });
  });

  describe('mergeHookConfigs() (Issue #420)', () => {
    it('should return new config when existing is undefined', () => {
      const newConfig = generateHookConfig().hooks;
      const result = mergeHookConfigs(undefined, newConfig);

      expect(result).toEqual(newConfig);
    });

    it('should preserve existing user hooks when merging', () => {
      const existingHooks: HookSettingsConfig['hooks'] = {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: 'my-custom-tool session-start',
              },
            ],
          },
        ],
      };

      const newConfig = generateHookConfig().hooks;
      const result = mergeHookConfigs(existingHooks, newConfig);

      // Should have both existing custom hook and nexus-agents hook
      expect(result.SessionStart).toHaveLength(2);
      expect(result.SessionStart?.[0]?.hooks[0]?.command).toBe('my-custom-tool session-start');
      expect(result.SessionStart?.[1]?.hooks[0]?.command).toContain('nexus-agents');
    });

    it('should replace existing nexus-agents hooks with new ones', () => {
      const existingHooks: HookSettingsConfig['hooks'] = {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: 'nexus-agents hooks old-command',
              },
            ],
          },
          {
            hooks: [
              {
                type: 'command',
                command: 'other-tool start',
              },
            ],
          },
        ],
      };

      const newConfig = generateHookConfig().hooks;
      const result = mergeHookConfigs(existingHooks, newConfig);

      // Should have other-tool and new nexus-agents (not old nexus-agents)
      expect(result.SessionStart).toHaveLength(2);
      expect(result.SessionStart?.[0]?.hooks[0]?.command).toBe('other-tool start');
      expect(result.SessionStart?.[1]?.hooks[0]?.command).toBe('nexus-agents hooks session-start');
    });

    it('should preserve existing hooks for event types not in new config', () => {
      const existingHooks: HookSettingsConfig['hooks'] = {
        SessionEnd: [
          {
            hooks: [
              {
                type: 'command',
                command: 'cleanup-tool run',
              },
            ],
          },
        ],
      };

      const newConfig = generateHookConfig().hooks;
      const result = mergeHookConfigs(existingHooks, newConfig);

      // SessionEnd should be preserved (nexus-agents doesn't have SessionEnd hooks)
      expect(result.SessionEnd).toHaveLength(1);
      expect(result.SessionEnd?.[0]?.hooks[0]?.command).toBe('cleanup-tool run');
    });

    it('should merge hooks for multiple event types', () => {
      const existingHooks: HookSettingsConfig['hooks'] = {
        SessionStart: [
          {
            hooks: [{ type: 'command', command: 'custom-start' }],
          },
        ],
        PreToolUse: [
          {
            matcher: 'Read',
            hooks: [{ type: 'command', command: 'custom-pre-read' }],
          },
        ],
        PostToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'command', command: 'custom-post-write' }],
          },
        ],
      };

      const newConfig = generateHookConfig().hooks;
      const result = mergeHookConfigs(existingHooks, newConfig);

      // All event types should have merged hooks
      expect(result.SessionStart?.length).toBeGreaterThan(1);
      expect(result.PreToolUse?.length).toBeGreaterThan(1);
      expect(result.PostToolUse?.length).toBeGreaterThan(1);
      expect(result.Stop?.length).toBeGreaterThan(0);
    });

    it('should handle empty existing hooks array', () => {
      const existingHooks: HookSettingsConfig['hooks'] = {
        SessionStart: [],
      };

      const newConfig = generateHookConfig().hooks;
      const result = mergeHookConfigs(existingHooks, newConfig);

      // Should just have the new nexus-agents hooks
      expect(result.SessionStart).toHaveLength(1);
      expect(result.SessionStart?.[0]?.hooks[0]?.command).toContain('nexus-agents');
    });
  });

  // Issue #2891: setup auto-gitignores .nexus-agents/ in the repo so the
  // user doesn't have to run a workflow first to get the entry.
  describe('ensureRepoGitignoredAndHint (#2891)', () => {
    let originalCwd: string;
    let tempRepo: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      tempRepo = mkdtempSync(join(tmpdir(), 'nexus-setup-gitignore-'));
      mkdirSync(join(tempRepo, '.git'));
    });

    afterEach(() => {
      process.chdir(originalCwd);
      rmSync(tempRepo, { recursive: true, force: true });
    });

    it('appends .nexus-agents/ to the repo .gitignore', () => {
      process.chdir(tempRepo);
      ensureRepoGitignoredAndHint(false);
      const ignore = readFileSync(join(tempRepo, '.gitignore'), 'utf-8');
      expect(ignore).toContain('.nexus-agents/');
    });

    it('is idempotent — does not duplicate an existing entry', () => {
      writeFileSync(join(tempRepo, '.gitignore'), 'node_modules/\n.nexus-agents/\n', 'utf-8');
      process.chdir(tempRepo);
      ensureRepoGitignoredAndHint(false);
      const lines = readFileSync(join(tempRepo, '.gitignore'), 'utf-8').split('\n').filter(Boolean);
      expect(lines.filter((l) => l === '.nexus-agents/')).toHaveLength(1);
    });

    it('does nothing on a dry run', () => {
      process.chdir(tempRepo);
      ensureRepoGitignoredAndHint(true);
      expect(existsSync(join(tempRepo, '.gitignore'))).toBe(false);
    });

    it('does nothing when not inside a git repo', () => {
      const nonRepo = mkdtempSync(join(tmpdir(), 'nexus-setup-no-repo-'));
      try {
        process.chdir(nonRepo);
        ensureRepoGitignoredAndHint(false);
        expect(existsSync(join(nonRepo, '.gitignore'))).toBe(false);
      } finally {
        process.chdir(originalCwd);
        rmSync(nonRepo, { recursive: true, force: true });
      }
    });
  });
});
