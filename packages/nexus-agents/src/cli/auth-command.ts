/**
 * nexus-agents auth command
 *
 * Authentication token management for MCP server.
 * Supports token generation, display, and rotation.
 *
 * (Source: Issue #739 - enable MCP authentication by default)
 */

import { existsSync, statSync, chmodSync } from 'node:fs';
import {
  AuthHandler,
  getDefaultTokenPath,
  readStoredToken,
} from '../mcp/middleware/auth-handler.js';

/**
 * Auth command subcommands.
 */
export type AuthSubcommand = 'init' | 'show' | 'rotate' | 'help';

/**
 * Options for auth command.
 */
export interface AuthCommandOptions {
  /** Subcommand to execute */
  subcommand?: AuthSubcommand;
  /** Force overwrite existing token */
  force?: boolean;
  /** Output format */
  format?: 'text' | 'json';
  /** Custom token file path */
  tokenFile?: string;
}

/**
 * Auth command result.
 */
export interface AuthCommandResult {
  /** Whether the operation was successful */
  readonly success: boolean;
  /** Operation performed */
  readonly operation: AuthSubcommand;
  /** Token file path */
  readonly tokenFile: string;
  /** Whether a token exists */
  readonly tokenExists: boolean;
  /** Token value (only shown on init/rotate) */
  readonly token?: string | undefined;
  /** Error message if failed */
  readonly error?: string | undefined;
  /** Token file permissions (octal) */
  readonly permissions?: string | undefined;
}

/**
 * Validates auth subcommand.
 */
export function isValidAuthSubcommand(value: string | undefined): value is AuthSubcommand {
  return value === 'init' || value === 'show' || value === 'rotate' || value === 'help';
}

/**
 * Gets file permissions as octal string.
 */
function getFilePermissions(filePath: string): string | undefined {
  try {
    const stats = statSync(filePath);
    return (stats.mode & 0o777).toString(8);
  } catch {
    return undefined;
  }
}

/**
 * Fixes file permissions to 600 (owner read/write only).
 */
function fixPermissions(filePath: string): void {
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Ignore errors (e.g., Windows)
  }
}

/**
 * Runs the auth init subcommand.
 * Generates a new authentication token.
 */
export function runAuthInit(options: AuthCommandOptions): AuthCommandResult {
  const tokenFile = options.tokenFile ?? getDefaultTokenPath();
  const tokenExists = existsSync(tokenFile);

  if (tokenExists && options.force !== true) {
    return {
      success: false,
      operation: 'init',
      tokenFile,
      tokenExists: true,
      error: `Token already exists at ${tokenFile}. Use --force to overwrite.`,
    };
  }

  const handler = new AuthHandler({ enabled: true, tokenFile });
  const token = handler.generateToken();
  fixPermissions(tokenFile);

  return {
    success: true,
    operation: 'init',
    tokenFile,
    tokenExists: true,
    token,
    permissions: getFilePermissions(tokenFile),
  };
}

/**
 * Runs the auth show subcommand.
 * Shows token status (not the token value).
 */
export function runAuthShow(options: AuthCommandOptions): AuthCommandResult {
  const tokenFile = options.tokenFile ?? getDefaultTokenPath();
  const tokenExists = existsSync(tokenFile);
  const token = readStoredToken(tokenFile);

  if (!tokenExists || token === undefined) {
    return {
      success: true,
      operation: 'show',
      tokenFile,
      tokenExists: false,
    };
  }

  const permissions = getFilePermissions(tokenFile);
  return {
    success: true,
    operation: 'show',
    tokenFile,
    tokenExists: true,
    permissions,
  };
}

/**
 * Runs the auth rotate subcommand.
 * Generates a new token, invalidating the old one.
 */
export function runAuthRotate(options: AuthCommandOptions): AuthCommandResult {
  const tokenFile = options.tokenFile ?? getDefaultTokenPath();
  const tokenExists = existsSync(tokenFile);

  if (!tokenExists) {
    return {
      success: false,
      operation: 'rotate',
      tokenFile,
      tokenExists: false,
      error: `No existing token found at ${tokenFile}. Use 'nexus-agents auth init' first.`,
    };
  }

  const handler = new AuthHandler({ enabled: true, tokenFile });
  const token = handler.rotateToken();
  fixPermissions(tokenFile);

  return {
    success: true,
    operation: 'rotate',
    tokenFile,
    tokenExists: true,
    token,
    permissions: getFilePermissions(tokenFile),
  };
}

/**
 * Runs the auth command with the specified subcommand.
 */
export function runAuthCommand(options: AuthCommandOptions): AuthCommandResult {
  const subcommand = options.subcommand ?? 'help';

  switch (subcommand) {
    case 'init':
      return runAuthInit(options);
    case 'show':
      return runAuthShow(options);
    case 'rotate':
      return runAuthRotate(options);
    case 'help':
      return {
        success: true,
        operation: 'help',
        tokenFile: getDefaultTokenPath(),
        tokenExists: existsSync(getDefaultTokenPath()),
      };
    default:
      return {
        success: false,
        operation: 'help',
        tokenFile: getDefaultTokenPath(),
        tokenExists: existsSync(getDefaultTokenPath()),
        error: `Unknown subcommand: ${String(subcommand)}`,
      };
  }
}

/** Formats help text for auth command. */
function formatHelpText(result: AuthCommandResult): string {
  const lines = [
    'nexus-agents auth - Authentication token management',
    '',
    'USAGE:',
    '  nexus-agents auth <subcommand> [options]',
    '',
    'SUBCOMMANDS:',
    '  init     Generate a new authentication token',
    '  show     Show token status (file location, permissions)',
    '  rotate   Generate a new token, invalidating the old one',
    '',
    'OPTIONS:',
    '  --force          Overwrite existing token (for init)',
    '  --format=<fmt>   Output format: text, json (default: text)',
    '',
    'EXAMPLES:',
    '  nexus-agents auth init          Generate initial token',
    '  nexus-agents auth show          Check token status',
    '  nexus-agents auth rotate        Rotate to new token',
    '  nexus-agents auth init --force  Regenerate token',
    '',
    `Token file: ${result.tokenFile}`,
    `Token exists: ${result.tokenExists ? 'yes' : 'no'}`,
  ];
  return lines.join('\n');
}

/** Formats init result text. */
function formatInitText(result: AuthCommandResult): string {
  const lines = [
    '✓ Authentication token generated successfully',
    '',
    `Token file: ${result.tokenFile}`,
    `Permissions: ${result.permissions ?? 'unknown'} (should be 600)`,
    '',
    'Your token (save this securely - it will not be shown again):',
    '',
    `  ${result.token ?? 'error'}`,
    '',
    'To use with MCP clients, set the Authorization header:',
    `  Authorization: Bearer ${result.token ?? '<token>'}`,
  ];
  return lines.join('\n');
}

/** Formats show result text. */
function formatShowText(result: AuthCommandResult): string {
  const lines = [
    'Authentication Token Status',
    '',
    `Token file: ${result.tokenFile}`,
    `Token exists: ${result.tokenExists ? 'yes' : 'no'}`,
  ];
  if (result.tokenExists && result.permissions !== undefined) {
    lines.push(`Permissions: ${result.permissions}`);
    if (result.permissions !== '600') {
      lines.push('  ⚠ Warning: Permissions should be 600 (owner read/write only)');
    }
  }
  if (!result.tokenExists) {
    lines.push('', 'Run "nexus-agents auth init" to generate a token.');
  }
  return lines.join('\n');
}

/** Formats rotate result text. */
function formatRotateText(result: AuthCommandResult): string {
  const lines = [
    '✓ Authentication token rotated successfully',
    '',
    'Previous token is now invalid.',
    `Token file: ${result.tokenFile}`,
    '',
    'New token (save this securely - it will not be shown again):',
    '',
    `  ${result.token ?? 'error'}`,
  ];
  return lines.join('\n');
}

/** Formats auth result for text output. */
function formatTextOutput(result: AuthCommandResult): string {
  if (result.operation === 'help') return formatHelpText(result);
  if (!result.success) return `Error: ${result.error ?? 'Unknown error'}`;

  switch (result.operation) {
    case 'init':
      return formatInitText(result);
    case 'show':
      return formatShowText(result);
    case 'rotate':
      return formatRotateText(result);
    default:
      return '';
  }
}

/**
 * Prints auth command result to stdout.
 */
export function printAuthResult(result: AuthCommandResult, format: 'text' | 'json' = 'text'): void {
  if (format === 'json') {
    // Don't include token in JSON output for security (unless explicitly needed)
    const jsonResult = { ...result };
    process.stdout.write(JSON.stringify(jsonResult, null, 2) + '\n');
  } else {
    process.stdout.write(formatTextOutput(result) + '\n');
  }
}

/**
 * Main auth command entry point.
 * Called by CLI dispatcher.
 */
export function authCommand(subcommand?: string, options?: Partial<AuthCommandOptions>): void {
  const parsedSubcommand = isValidAuthSubcommand(subcommand) ? subcommand : 'help';
  const result = runAuthCommand({
    ...options,
    subcommand: parsedSubcommand,
  });
  const format = options?.format ?? 'text';
  printAuthResult(result, format);

  if (!result.success) {
    process.exitCode = 1;
  }
}
