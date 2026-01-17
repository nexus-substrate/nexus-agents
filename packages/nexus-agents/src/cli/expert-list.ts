/**
 * nexus-agents expert list command
 *
 * Lists all available experts (built-in and custom).
 *
 * (Source: Issue #66, PROJECT_PLAN.md Section 5.2)
 * (Updated: Issue #300 - Load custom experts from config)
 */

import { DEFAULT_EXPERTS } from '../agents/experts/expert-defaults.js';
import type { ExpertDefinition } from '../agents/experts/expert-selector-types.js';
import {
  loadCustomExperts,
  formatValidationErrors,
  type CustomExpertError,
} from './custom-expert-loader.js';

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/**
 * Output format for expert list.
 */
export type ExpertListFormat = 'table' | 'json' | 'yaml';

/**
 * Options for the expert list command.
 */
export interface ExpertListOptions {
  /** Output format */
  readonly format?: ExpertListFormat;
  /** Show detailed information */
  readonly verbose?: boolean;
  /** Custom config file path */
  readonly configPath?: string;
}

/**
 * Expert list result.
 */
export interface ExpertListResult {
  readonly success: boolean;
  readonly builtIn: ExpertDefinition[];
  readonly custom: ExpertDefinition[];
  readonly message: string;
  /** Validation errors for custom experts */
  readonly validationErrors: readonly CustomExpertError[];
  /** Path to config file (if loaded) */
  readonly configPath: string | undefined;
}

/**
 * Maps domain to tier for display purposes.
 */
function getDomainTier(domain: string): string {
  const tierMap: Record<string, string> = {
    security: 'powerful',
    architecture: 'powerful',
    code: 'balanced',
    testing: 'balanced',
    documentation: 'balanced',
  };
  return tierMap[domain] ?? 'balanced';
}

/**
 * Pads a string to a specified width.
 */
function padString(str: string, width: number): string {
  if (str.length >= width) {
    return str.slice(0, width - 3) + '...';
  }
  return str + ' '.repeat(width - str.length);
}

/**
 * Formats experts as a table.
 */
function formatTable(experts: ExpertDefinition[], title: string): string {
  if (experts.length === 0) {
    return `${title}: ${colors.dim}(none)${colors.reset}\n`;
  }

  const nameWidth = 18;
  const domainWidth = 50;
  const tierWidth = 10;

  const lines: string[] = [
    `${colors.bold}${title}:${colors.reset}`,
    `┌${'─'.repeat(nameWidth)}┬${'─'.repeat(domainWidth)}┬${'─'.repeat(tierWidth)}┐`,
    `│${padString(' Name', nameWidth)}│${padString(' Domain', domainWidth)}│${padString(' Tier', tierWidth)}│`,
    `├${'─'.repeat(nameWidth)}┼${'─'.repeat(domainWidth)}┼${'─'.repeat(tierWidth)}┤`,
  ];

  for (const expert of experts) {
    const tier = getDomainTier(expert.primaryDomain);
    lines.push(
      `│${padString(` ${expert.name}`, nameWidth)}│${padString(` ${expert.description}`, domainWidth)}│${padString(` ${tier}`, tierWidth)}│`
    );
  }

  lines.push(`└${'─'.repeat(nameWidth)}┴${'─'.repeat(domainWidth)}┴${'─'.repeat(tierWidth)}┘`);

  return lines.join('\n') + '\n';
}

/**
 * Formats experts as JSON.
 */
function formatJson(builtIn: ExpertDefinition[], custom: ExpertDefinition[]): string {
  const output = {
    builtIn: builtIn.map((e) => ({
      id: e.id,
      name: e.name,
      domain: e.primaryDomain,
      secondaryDomains: e.secondaryDomains,
      description: e.description,
      capabilities: e.capabilities,
      tier: getDomainTier(e.primaryDomain),
      available: e.available,
    })),
    custom: custom.map((e) => ({
      id: e.id,
      name: e.name,
      domain: e.primaryDomain,
      secondaryDomains: e.secondaryDomains,
      description: e.description,
      capabilities: e.capabilities,
      tier: getDomainTier(e.primaryDomain),
      available: e.available,
    })),
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Formats experts as YAML.
 */
function formatYaml(builtIn: ExpertDefinition[], custom: ExpertDefinition[]): string {
  const formatExpert = (e: ExpertDefinition): string => {
    const lines = [
      `  - id: ${e.id}`,
      `    name: ${e.name}`,
      `    domain: ${e.primaryDomain}`,
      `    secondaryDomains: [${e.secondaryDomains.join(', ')}]`,
      `    description: ${e.description}`,
      `    capabilities: [${e.capabilities.join(', ')}]`,
      `    tier: ${getDomainTier(e.primaryDomain)}`,
      `    available: ${String(e.available)}`,
    ];
    return lines.join('\n');
  };

  const lines = ['builtIn:'];

  if (builtIn.length === 0) {
    lines.push('  []');
  } else {
    for (const e of builtIn) {
      lines.push(formatExpert(e));
    }
  }

  lines.push('custom:');

  if (custom.length === 0) {
    lines.push('  []');
  } else {
    for (const e of custom) {
      lines.push(formatExpert(e));
    }
  }

  return lines.join('\n');
}

/**
 * Runs the expert list command.
 *
 * @param options - List options
 * @returns Expert list result
 */
export function runExpertList(options: ExpertListOptions = {}): ExpertListResult {
  const builtIn = DEFAULT_EXPERTS;

  // Load custom experts from config (Issue #300)
  const customResult = loadCustomExperts(options.configPath);
  const custom = customResult.experts;
  const validationErrors = customResult.errors;

  // Determine success - we succeed even with validation errors if we loaded some experts
  const hasErrors = validationErrors.length > 0;
  const success = !hasErrors || custom.length > 0;

  // Build message
  let message = `Found ${String(builtIn.length)} built-in experts`;
  message += ` and ${String(custom.length)} custom experts`;
  if (hasErrors) {
    message += ` (${String(validationErrors.length)} validation error${validationErrors.length === 1 ? '' : 's'})`;
  }

  return {
    success,
    builtIn,
    custom,
    message,
    validationErrors,
    configPath: customResult.configPath ?? undefined,
  };
}

/**
 * Prints the expert list result.
 */
export function printExpertListResult(
  result: ExpertListResult,
  options: ExpertListOptions = {}
): void {
  const format = options.format ?? 'table';
  const writeLine = (text: string): void => {
    process.stdout.write(text + '\n');
  };

  switch (format) {
    case 'json':
      writeLine(formatJson(result.builtIn, result.custom));
      break;

    case 'yaml':
      writeLine(formatYaml(result.builtIn, result.custom));
      break;

    case 'table':
    default:
      writeLine('');
      if (result.configPath !== undefined) {
        writeLine(`${colors.dim}Config: ${result.configPath}${colors.reset}`);
        writeLine('');
      }
      writeLine(formatTable(result.builtIn, 'Built-in Experts'));
      writeLine(formatTable(result.custom, 'Custom Experts'));
      break;
  }

  // Print validation errors if any
  if (result.validationErrors.length > 0) {
    writeLine('');
    writeLine(`${colors.yellow}${colors.bold}Validation Errors:${colors.reset}`);
    writeLine(formatValidationErrors(result.validationErrors));
  }
}

/**
 * Runs the expert list command and prints results.
 * Returns exit code (0 = success).
 */
export function expertListCommand(options: ExpertListOptions = {}): number {
  const result = runExpertList(options);
  printExpertListResult(result, options);
  return result.success ? 0 : 1;
}
