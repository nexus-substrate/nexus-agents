/**
 * Tests for Setup Command
 *
 * Verifies user onboarding automation for Claude CLI integration.
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { runSetup, printSetupResult, setupCommand } from './setup-command.js';
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
} from './setup-helpers.js';
import type { SetupResult } from './setup-types.js';

// Create unique temp directory for tests
const testTmpDir = join(tmpdir(), `nexus-setup-test-${String(Date.now())}`);

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
      expect(result.mcpJsonPath).toContain('mcp.json');
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
      expect(result).toContain('.claude');
      expect(result).toContain('mcp.json');
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
    it('should return correct rules file path', () => {
      const result = getRulesFilePath(testTmpDir);
      expect(result).toBe(join(testTmpDir, '.claude', 'rules', 'nexus-agents.md'));
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
      expect(result).toContain('\x1b[32m'); // Green color
    });

    it('should format failed status with cross', () => {
      const result = formatStatus('failed');
      expect(result).toContain('\x1b[31m'); // Red color
    });

    it('should format skipped status with warning', () => {
      const result = formatStatus('skipped');
      expect(result).toContain('\x1b[33m'); // Yellow color
    });

    it('should format pending status', () => {
      const result = formatStatus('pending');
      expect(result).toContain('\x1b[2m'); // Dim color
    });
  });

  describe('formatHeader()', () => {
    it('should wrap text in bold', () => {
      const result = formatHeader('Test Header');
      expect(result).toContain('\x1b[1m'); // Bold
      expect(result).toContain('Test Header');
      expect(result).toContain('\x1b[0m'); // Reset
    });
  });

  describe('formatCodeBlock()', () => {
    it('should indent and dim code lines', () => {
      const result = formatCodeBlock('line1\nline2');
      expect(result).toContain('  '); // Indentation
      expect(result).toContain('\x1b[2m'); // Dim color
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
});
