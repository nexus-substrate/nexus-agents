/**
 * nexus-agents setup command helpers
 *
 * Helper functions for environment detection, MCP snippet generation,
 * and CLAUDE.md rules file generation.
 *
 * @module cli/setup-helpers
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { VERSION } from '../version.js';
import type {
  ClaudeCliInfo,
  McpConfigInfo,
  McpJsonConfig,
  McpServerEntry,
  ProjectInfo,
  ProjectType,
  EnvironmentInfo,
  BackupInfo,
} from './setup-types.js';

// ============================================================================
// Constants
// ============================================================================

/** MCP entry for nexus-agents */
export const NEXUS_AGENTS_MCP_ENTRY: McpServerEntry = {
  command: 'nexus-agents',
  args: ['--mode=server'],
};

/** MCP entry with npx for users who install globally */
export const NEXUS_AGENTS_MCP_NPX_ENTRY: McpServerEntry = {
  command: 'npx',
  args: ['-y', 'nexus-agents@latest', '--mode=server'],
};

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Detects if Claude CLI is installed and available.
 */
export function detectClaudeCli(): ClaudeCliInfo {
  const configPath = join(homedir(), '.claude');
  const mcpJsonPath = join(configPath, 'mcp.json');

  try {
    const result = execSync('claude --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const version = parseClaudeVersion(result);

    return {
      installed: true,
      version,
      configPath,
      mcpJsonPath,
    };
  } catch {
    return {
      installed: false,
      version: undefined,
      configPath,
      mcpJsonPath,
    };
  }
}

/**
 * Parses Claude CLI version from output.
 */
function parseClaudeVersion(output: string): string | undefined {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match?.[1];
}

/**
 * Detects existing MCP configuration.
 */
export function detectMcpConfig(mcpJsonPath: string): McpConfigInfo | undefined {
  if (!existsSync(mcpJsonPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(mcpJsonPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    const config = parsed as McpJsonConfig;
    const mcpServers = config.mcpServers ?? {};
    const servers = Object.keys(mcpServers);

    return {
      exists: true,
      path: mcpJsonPath,
      hasNexusAgents: servers.includes('nexus-agents'),
      servers,
    };
  } catch {
    return {
      exists: true,
      path: mcpJsonPath,
      hasNexusAgents: false,
      servers: [],
    };
  }
}

/** Checks for TypeScript in package.json devDependencies. */
function hasTypeScriptInPackageJson(root: string): boolean {
  try {
    const content = readFileSync(join(root, 'package.json'), 'utf-8');
    const parsed: unknown = JSON.parse(content);
    const pkg = parsed as Record<string, unknown>;
    const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;
    return devDeps?.['typescript'] !== undefined;
  } catch {
    return false;
  }
}

/** Mapping of config files to project types. */
const CONFIG_FILE_TYPES: readonly [string, ProjectType][] = [
  ['tsconfig.json', 'typescript'],
  ['Cargo.toml', 'rust'],
  ['go.mod', 'go'],
  ['pyproject.toml', 'python'],
  ['setup.py', 'python'],
  ['pom.xml', 'java'],
  ['build.gradle', 'java'],
];

/**
 * Detects project type based on configuration files.
 */
export function detectProjectType(root: string): ProjectType {
  // Check config files
  for (const [file, type] of CONFIG_FILE_TYPES) {
    if (existsSync(join(root, file))) return type;
  }

  // Check package.json
  if (existsSync(join(root, 'package.json'))) {
    return hasTypeScriptInPackageJson(root) ? 'typescript' : 'javascript';
  }

  return 'unknown';
}

/**
 * Detects project information.
 */
export function detectProjectInfo(root: string): ProjectInfo {
  let packageName: string | undefined;

  if (existsSync(join(root, 'package.json'))) {
    try {
      const content = readFileSync(join(root, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content) as Record<string, unknown>;
      packageName = pkg['name'] as string | undefined;
    } catch {
      // Ignore parse errors
    }
  }

  return {
    root,
    hasPackageJson: existsSync(join(root, 'package.json')),
    hasClaudeMd: existsSync(join(root, 'CLAUDE.md')),
    hasClaudeRules: existsSync(join(root, '.claude', 'rules')),
    hasNexusConfig: existsSync(join(root, 'nexus-agents.yaml')),
    projectType: detectProjectType(root),
    packageName: packageName ?? basename(root),
  };
}

/**
 * Detects complete environment information.
 */
export function detectEnvironment(projectRoot: string): EnvironmentInfo {
  const claudeCli = detectClaudeCli();
  const existingMcpConfig = detectMcpConfig(claudeCli.mcpJsonPath);
  const projectInfo = detectProjectInfo(projectRoot);

  return {
    platform: process.platform,
    homeDir: homedir(),
    claudeCli,
    existingMcpConfig,
    projectInfo,
  };
}

// ============================================================================
// MCP Snippet Generation
// ============================================================================

/**
 * Generates MCP configuration snippet for user to paste.
 */
export function generateMcpSnippet(useNpx: boolean = false): string {
  const entry = useNpx ? NEXUS_AGENTS_MCP_NPX_ENTRY : NEXUS_AGENTS_MCP_ENTRY;
  const config: McpJsonConfig = {
    mcpServers: {
      'nexus-agents': entry,
    },
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generates the full MCP JSON path based on scope.
 */
export function getMcpJsonPath(scope: 'user' | 'project', projectRoot: string): string {
  if (scope === 'project') {
    return join(projectRoot, '.mcp.json');
  }
  return join(homedir(), '.claude', 'mcp.json');
}

// ============================================================================
// Rules File Generation
// ============================================================================

/**
 * Generates the nexus-agents rules file content.
 */
export function generateRulesContent(): string {
  return `# Nexus-Agents Integration

This project uses [nexus-agents](https://github.com/williamzujkowski/nexus-agents) v${VERSION} for multi-agent orchestration.

## MCP Tools Available

When running with MCP server mode, these tools are available:

| Tool | Description |
|------|-------------|
| \`orchestrate\` | Task orchestration with TechLead coordination |
| \`create_expert\` | Dynamic expert agent creation |
| \`run_workflow\` | Execute workflow templates |
| \`delegate_to_model\` | Route task to optimal model |
| \`consensus_vote\` | Multi-model consensus building |

## Quick Commands

\`\`\`bash
# Orchestrate a task with specialized experts
nexus-agents orchestrate "Implement feature X with tests"

# List available experts
nexus-agents expert list

# Run a workflow
nexus-agents workflow list
nexus-agents workflow run code-review --input='{"url": "..."}'

# Check system health
nexus-agents doctor

# Generate config
nexus-agents config init
\`\`\`

## Usage Examples

**Orchestrate a code review:**
\`\`\`
Use nexus-agents to review this PR: https://github.com/owner/repo/pull/123
\`\`\`

**Create a specialized expert:**
\`\`\`
Create a security expert to audit this codebase for vulnerabilities
\`\`\`

**Run a workflow:**
\`\`\`
Run the code-review workflow with the current changes
\`\`\`

## Configuration

- Config file: \`./nexus-agents.yaml\`
- Generate config: \`nexus-agents config init\`
- Check health: \`nexus-agents doctor\`

---
*Generated by nexus-agents setup v${VERSION}*
`;
}

/**
 * Gets the rules file path.
 */
export function getRulesFilePath(projectRoot: string): string {
  return join(projectRoot, '.claude', 'rules', 'nexus-agents.md');
}

/**
 * Creates the rules file.
 */
export function createRulesFile(projectRoot: string, dryRun: boolean): string {
  const rulesPath = getRulesFilePath(projectRoot);
  const content = generateRulesContent();

  if (!dryRun) {
    const rulesDir = dirname(rulesPath);
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(rulesPath, content, 'utf-8');
  }

  return rulesPath;
}

// ============================================================================
// Backup and Rollback
// ============================================================================

/**
 * Creates a backup of a file.
 */
export function backupFile(filePath: string): BackupInfo {
  const content = readFileSync(filePath, 'utf-8');
  const backupPath = `${filePath}.backup.${String(Date.now())}`;
  writeFileSync(backupPath, content, 'utf-8');

  return {
    type: 'file',
    originalPath: filePath,
    backupPath,
    content,
  };
}

/**
 * Restores a file from backup.
 */
export function restoreBackup(backup: BackupInfo): void {
  writeFileSync(backup.originalPath, backup.content, 'utf-8');
}

// ============================================================================
// Output Formatting
// ============================================================================

/** ANSI color codes */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/** Platform-appropriate symbols */
const symbols = {
  check: process.platform === 'win32' ? '√' : '✓',
  cross: process.platform === 'win32' ? '×' : '✗',
  warn: process.platform === 'win32' ? '!' : '⚠',
  arrow: process.platform === 'win32' ? '->' : '→',
};

/**
 * Formats a status indicator.
 */
export function formatStatus(status: 'success' | 'failed' | 'skipped' | 'pending'): string {
  switch (status) {
    case 'success':
      return `${colors.green}${symbols.check}${colors.reset}`;
    case 'failed':
      return `${colors.red}${symbols.cross}${colors.reset}`;
    case 'skipped':
      return `${colors.yellow}${symbols.warn}${colors.reset}`;
    case 'pending':
      return `${colors.dim}○${colors.reset}`;
  }
}

/**
 * Formats a section header.
 */
export function formatHeader(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

/**
 * Formats a code block for terminal output.
 */
export function formatCodeBlock(code: string): string {
  const lines = code.split('\n');
  return lines.map((line) => `  ${colors.dim}${line}${colors.reset}`).join('\n');
}

/**
 * Checks if running in interactive mode.
 */
export function isInteractive(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env['CI'] === 'true') return false;
  if (process.env['CONTINUOUS_INTEGRATION'] !== undefined) return false;
  return true;
}
