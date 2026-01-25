/**
 * nexus-agents setup command helpers
 *
 * Helper functions for environment detection, MCP snippet generation,
 * and CLAUDE.md rules file generation.
 *
 * @module cli/setup-helpers
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

// Re-export environment detection
export {
  detectClaudeCli,
  detectMcpConfig,
  detectProjectType,
  detectProjectInfo,
  detectEnvironment,
} from './setup-environment.js';

// Re-export MCP configuration
export {
  NEXUS_AGENTS_MCP_ENTRY,
  NEXUS_AGENTS_MCP_NPX_ENTRY,
  generateMcpSnippet,
  getMcpJsonPath,
  configureMcpServer,
  isMcpServerConfigured,
  // Hook configuration (Issue #416, #420)
  generateHookConfig,
  generateHookSnippet,
  configureHooks,
  areHooksConfigured,
  getExistingHooks,
  mergeHookConfigs,
} from './setup-mcp.js';
export type { McpConfigResult, HookConfigResult, HookSettingsConfig } from './setup-mcp.js';

// Re-export rules generation
export {
  generateRulesContent,
  getRulesFilePath,
  createRulesFile,
  backupFile,
  restoreBackup,
} from './setup-rules.js';

// Re-export output formatting
export { formatStatus, formatHeader, formatCodeBlock, isInteractive } from './setup-formatting.js';
