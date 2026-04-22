/**
 * nexus-agents Per-Command Help
 *
 * Structured help metadata for individual CLI commands.
 * Used by `nexus-agents <command> --help` to show targeted help.
 *
 * @module cli-command-help
 */

/**
 * Flag metadata for a CLI command.
 */
export interface CommandFlagEntry {
  readonly flag: string;
  readonly description: string;
  readonly defaultValue?: string;
}

/**
 * Structured help entry for a single CLI command.
 */
export interface CommandHelpEntry {
  readonly command: string;
  readonly description: string;
  readonly examples: readonly string[];
  readonly flags?: readonly CommandFlagEntry[];
  readonly requiresApiKey?: readonly string[];
}

const ORCHESTRATE_HELP: CommandHelpEntry = {
  command: 'orchestrate',
  description: 'Execute a task using CLI tools (standalone mode). Routes to optimal model.',
  examples: [
    'nexus-agents orchestrate "Explain this function"',
    'nexus-agents orchestrate "Generate unit tests" --model=claude',
    'nexus-agents orchestrate "Refactor code" --format=json --dry-run',
    'nexus-agents orchestrate "Build feature" --engine=puppeteer --max-tokens=50000',
  ],
  flags: [
    {
      flag: '--engine=<name>',
      description: 'Execution engine: router, puppeteer',
      defaultValue: 'router',
    },
    { flag: '--model=<cli>', description: 'Target CLI: claude, gemini, codex, opencode' },
    { flag: '--max-tokens=<n>', description: 'Maximum token budget', defaultValue: '100000' },
    { flag: '--max-cost-usd=<n>', description: 'Maximum cost budget in USD', defaultValue: '10' },
    { flag: '--format=<fmt>', description: 'Output format: text, json', defaultValue: 'text' },
    { flag: '--dry-run', description: 'Show routing decision without executing' },
  ],
  requiresApiKey: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY'],
};

const VOTE_HELP: CommandHelpEntry = {
  command: 'vote',
  description: 'Run multi-agent consensus vote on a proposal (6 agents by default).',
  examples: [
    'nexus-agents vote --proposal "Add caching layer"',
    'nexus-agents vote -p "Migrate to PostgreSQL" -t supermajority',
    'nexus-agents vote -p "Quick decision" --quick',
    'nexus-agents vote -p "Test idea" --dry-run',
  ],
  flags: [
    { flag: '-p, --proposal <text>', description: 'Proposal text to vote on (required)' },
    { flag: '-t, --threshold <t>', description: 'Threshold: majority, supermajority, unanimous' },
    { flag: '--quick', description: 'Use 3 agents instead of 6 for faster votes' },
    { flag: '--dry-run', description: 'Simulate votes without agent execution' },
    { flag: '--timeout=<seconds>', description: 'Timeout per vote in seconds', defaultValue: '90' },
    { flag: '--verbose', description: 'Show vote verification hashes' },
  ],
  requiresApiKey: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY'],
};

const EXPERT_HELP: CommandHelpEntry = {
  command: 'expert',
  description: 'Manage expert agents. Subcommands: list, create, execute.',
  examples: ['nexus-agents expert list', 'nexus-agents expert list --format=json'],
  flags: [
    {
      flag: '--format=<fmt>',
      description: 'Output format: table, json, yaml',
      defaultValue: 'table',
    },
  ],
};

const WORKFLOW_HELP: CommandHelpEntry = {
  command: 'workflow',
  description: 'Manage and run workflow templates. Subcommands: list, run.',
  examples: [
    'nexus-agents workflow list',
    'nexus-agents workflow run code-review --input=\'{"url":"https://github.com/o/r/pull/1"}\'',
    'nexus-agents workflow run code-review --dry-run',
  ],
  flags: [
    { flag: '-i, --input <json>', description: 'Workflow inputs as JSON string or file path' },
    { flag: '--dry-run', description: 'Validate workflow without executing' },
  ],
};

const DOCTOR_HELP: CommandHelpEntry = {
  command: 'doctor',
  description: 'Check CLI installations, adapters, and system health.',
  examples: ['nexus-agents doctor', 'nexus-agents doctor --deep', 'nexus-agents doctor --fix'],
  flags: [
    { flag: '--deep', description: 'Run deep health checks (adapter connectivity)' },
    { flag: '--fix', description: 'Auto-fix correctable issues (data dirs, config)' },
    { flag: '--verbose', description: 'Show detailed check output' },
  ],
};

const SETUP_HELP: CommandHelpEntry = {
  command: 'setup',
  description: 'Configure MCP integration for Claude, Gemini, Codex, and OpenCode CLIs.',
  examples: [
    'nexus-agents setup',
    'nexus-agents setup --interactive',
    'nexus-agents setup --skip-mcp --skip-hooks',
    'nexus-agents setup --scope=project --dry-run',
  ],
  flags: [
    { flag: '--interactive', description: 'Run guided setup wizard with prompts' },
    { flag: '--non-interactive', description: 'Skip prompts (for CI/automation)' },
    { flag: '--force', description: 'Overwrite existing configuration files' },
    { flag: '--skip-mcp', description: 'Skip MCP configuration' },
    { flag: '--skip-config', description: 'Skip config file generation' },
    { flag: '--skip-rules', description: 'Skip .rules generation' },
    { flag: '--skip-hooks', description: 'Skip hook configuration' },
    { flag: '--skip-opencode', description: 'Skip OpenCode MCP setup' },
    { flag: '--skip-gemini', description: 'Skip Gemini MCP setup' },
    { flag: '--skip-codex', description: 'Skip Codex MCP setup' },
    {
      flag: '--scope=<scope>',
      description: 'MCP config scope: user, project',
      defaultValue: 'user',
    },
    { flag: '--dry-run', description: 'Show changes without applying them' },
    {
      flag: '--custom-api <url>',
      description:
        'Configure OpenAI-compatible gateway (short-circuits normal setup; validates URL + probes /models) [#2124]',
    },
    { flag: '--custom-api-key <key>', description: 'API key for --custom-api (else prompt/env)' },
    {
      flag: '--custom-model <id>',
      description: 'Default model for --custom-api (default: gpt-4o)',
    },
  ],
};

const CONFIG_HELP: CommandHelpEntry = {
  command: 'config',
  description:
    'Manage nexus-agents configuration. Subcommands: init, get, set, list, reset, export, import.',
  examples: [
    'nexus-agents config init',
    'nexus-agents config get TIMEOUT_DEFAULTS.cliMs',
    'nexus-agents config set TIMEOUT_DEFAULTS.cliMs 90000',
    'nexus-agents config list',
    'nexus-agents config export ./config.json',
    'nexus-agents config import ./config.yaml',
  ],
  flags: [
    {
      flag: '-o, --output <path>',
      description: 'Output path for config init',
      defaultValue: './nexus-agents.yaml',
    },
    { flag: '-f, --force', description: 'Overwrite existing configuration file' },
  ],
};

const RESEARCH_HELP: CommandHelpEntry = {
  command: 'research',
  description:
    'Manage research registry and paper tracking. Subcommands: status, overlap, add, stats, refresh, check, index.',
  examples: [
    'nexus-agents research status',
    'nexus-agents research stats --format=json',
    'nexus-agents research add 2401.12345',
    'nexus-agents research refresh',
    'nexus-agents research check',
  ],
  flags: [
    { flag: '--format=<fmt>', description: 'Output format: table, json', defaultValue: 'table' },
    { flag: '-o, --output=<path>', description: 'Custom output path for refresh' },
  ],
};

const FITNESS_AUDIT_HELP: CommandHelpEntry = {
  command: 'fitness-audit',
  description: 'Run CLI orchestration fitness score audit. Target: 90+/100.',
  examples: [
    'nexus-agents fitness-audit',
    'nexus-agents fitness-audit --format=json',
    'nexus-agents fitness-audit --min-severity=warning',
  ],
  flags: [
    { flag: '--format=<fmt>', description: 'Output format: json, text', defaultValue: 'text' },
    {
      flag: '--min-severity=<sev>',
      description: 'Filter: info, warning, critical',
      defaultValue: 'all',
    },
  ],
};

const REVIEW_HELP: CommandHelpEntry = {
  command: 'review',
  description: 'Review a GitHub pull request (dogfooding mode).',
  examples: [
    'nexus-agents review https://github.com/owner/repo/pull/123',
    'nexus-agents review owner/repo#123 --dry-run',
    'nexus-agents review --setup',
  ],
  flags: [
    { flag: '--setup', description: 'Run review setup wizard' },
    { flag: '--dry-run', description: 'Review without posting to GitHub' },
    { flag: '--skip-checks', description: 'Skip pre-flight validation' },
  ],
};

/**
 * All per-command help entries.
 */
export const COMMAND_HELP: readonly CommandHelpEntry[] = [
  ORCHESTRATE_HELP,
  VOTE_HELP,
  EXPERT_HELP,
  WORKFLOW_HELP,
  DOCTOR_HELP,
  SETUP_HELP,
  CONFIG_HELP,
  RESEARCH_HELP,
  FITNESS_AUDIT_HELP,
  REVIEW_HELP,
];

/** Formats a single flag line with alignment. */
function formatFlag(entry: CommandFlagEntry): string {
  const defaultSuffix = entry.defaultValue !== undefined ? ` (default: ${entry.defaultValue})` : '';
  return `  ${entry.flag.padEnd(28)} ${entry.description}${defaultSuffix}`;
}

/**
 * Formats help output for a specific command.
 *
 * @param command - The command name to look up
 * @returns Formatted help string, or undefined if no help entry exists
 */
export function formatCommandHelp(command: string): string | undefined {
  const entry = COMMAND_HELP.find((e) => e.command === command);
  if (entry === undefined) return undefined;

  const lines: string[] = [];
  lines.push(`nexus-agents ${entry.command} -- ${entry.description}`);
  lines.push('');

  if (entry.flags !== undefined && entry.flags.length > 0) {
    lines.push('FLAGS:');
    for (const flag of entry.flags) {
      lines.push(formatFlag(flag));
    }
    lines.push('');
  }

  if (entry.requiresApiKey !== undefined && entry.requiresApiKey.length > 0) {
    lines.push(`REQUIRES: ${entry.requiresApiKey.join(', ')} (at least one)`);
    lines.push('');
  }

  lines.push('EXAMPLES:');
  for (const example of entry.examples) {
    lines.push(`  ${example}`);
  }

  return lines.join('\n');
}

/**
 * Formats a grouped summary of all commands with descriptions.
 *
 * @returns Formatted string listing all commands with their descriptions
 */
export function formatAllCommandsHelp(): string {
  const lines: string[] = [];
  lines.push('nexus-agents -- Per-command help is available:');
  lines.push('');

  for (const entry of COMMAND_HELP) {
    lines.push(`  ${entry.command.padEnd(20)} ${entry.description}`);
  }

  lines.push('');
  lines.push('Run "nexus-agents <command> --help" for detailed command help.');
  lines.push('Run "nexus-agents --help" for full usage information.');

  return lines.join('\n');
}
