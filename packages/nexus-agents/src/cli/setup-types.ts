/**
 * nexus-agents setup command types
 *
 * Type definitions for the user onboarding automation system.
 *
 * @module cli/setup-types
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { z } from 'zod';
import type { CommandResult } from '../core/index.js';

/**
 * Setup command options schema.
 */
export const SetupOptionsSchema = z.object({
  /** Skip interactive prompts */
  nonInteractive: z.boolean().default(false),
  /** Overwrite existing configurations */
  force: z.boolean().default(false),
  /** Skip MCP configuration */
  skipMcp: z.boolean().default(false),
  /** Skip CLAUDE.md/rules generation */
  skipRules: z.boolean().default(false),
  /** Skip hooks configuration (Issue #416) */
  skipHooks: z.boolean().default(false),
  /** Skip config file generation (#1252) */
  skipConfig: z.boolean().default(false),
  /** Skip OpenCode MCP configuration (#1253) */
  skipOpencode: z.boolean().default(false),
  /** Skip Gemini CLI MCP configuration (#1259) */
  skipGemini: z.boolean().default(false),
  /** Show what would be done without making changes */
  dryRun: z.boolean().default(false),
  /** Show detailed output */
  verbose: z.boolean().default(false),
  /** Target scope for MCP config */
  scope: z.enum(['user', 'project']).default('user'),
});

export type SetupOptions = z.infer<typeof SetupOptionsSchema>;

/**
 * Claude CLI detection result.
 */
export interface ClaudeCliInfo {
  readonly installed: boolean;
  readonly version: string | undefined;
  readonly configPath: string;
  readonly mcpJsonPath: string;
}

/**
 * Existing MCP configuration info.
 */
export interface McpConfigInfo {
  readonly exists: boolean;
  readonly path: string;
  readonly hasNexusAgents: boolean;
  readonly servers: readonly string[];
}

/**
 * MCP server configuration entry.
 */
export interface McpServerEntry {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
}

/**
 * MCP JSON configuration format.
 */
export interface McpJsonConfig {
  readonly mcpServers?: Record<string, McpServerEntry>;
}

/**
 * Project type detection.
 */
export type ProjectType =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'unknown';

/**
 * Project information.
 */
export interface ProjectInfo {
  readonly root: string;
  readonly hasPackageJson: boolean;
  readonly hasClaudeMd: boolean;
  readonly hasClaudeRules: boolean;
  readonly hasNexusConfig: boolean;
  readonly projectType: ProjectType;
  readonly packageName?: string;
}

/**
 * Complete environment information.
 */
export interface EnvironmentInfo {
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly claudeCli: ClaudeCliInfo;
  readonly existingMcpConfig: McpConfigInfo | undefined;
  readonly projectInfo: ProjectInfo;
}

/**
 * Setup step status.
 */
export interface SetupStep {
  readonly name: string;
  readonly status: 'pending' | 'success' | 'skipped' | 'failed' | 'warning';
  readonly message?: string;
  readonly durationMs?: number;
}

/**
 * Setup result summary.
 * Extends CommandResult base pattern (Issue #584).
 */
export interface SetupResult extends CommandResult {
  /** Setup steps executed */
  readonly steps: readonly SetupStep[];
  /** MCP configuration was successful via Claude CLI */
  readonly mcpConfigured?: boolean;
  /** Fallback MCP snippet for manual configuration */
  readonly mcpSnippet?: string;
  /** Hooks configuration was successful via Claude CLI (Issue #416) */
  readonly hooksConfigured?: boolean;
  /** Fallback hook snippet for manual configuration */
  readonly hookSnippet?: string;
  readonly rulesPath?: string;
  /** Data directory path if initialized (#1249) */
  readonly dataDirPath?: string;
  /** Number of data directories created (#1249) */
  readonly dataDirsCreated?: number;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly durationMs: number;
}

/**
 * Backup information for rollback.
 */
export interface BackupInfo {
  readonly type: 'file';
  readonly originalPath: string;
  readonly backupPath: string;
  readonly content: string;
}

/**
 * Rollback item types.
 */
export type RollbackItem =
  | { type: 'file-backup'; backup: BackupInfo }
  | { type: 'file-created'; path: string }
  | { type: 'file-modified'; backup: BackupInfo };
