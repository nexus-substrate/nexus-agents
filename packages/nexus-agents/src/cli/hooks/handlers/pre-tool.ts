/**
 * nexus-agents/cli/hooks/handlers - Pre-Tool Handler
 *
 * Handles PreToolUse hook events with input validation
 * and optional dangerous command detection.
 *
 * @module cli/hooks/handlers/pre-tool
 * (Source: Issue #414 - Hook handlers for tool lifecycle)
 */

import type { PreToolUseInput, HookResult } from '../hook-types.js';
import { exitSuccess, allowTool, denyTool, modifyToolInput } from '../hook-output.js';
import { createLogger } from '../../../core/logger.js';
import { safeString } from './handler-utils.js';

const logger = createLogger({ component: 'PreToolHandler' });

/**
 * Configuration for pre-tool handler.
 */
export interface PreToolHandlerConfig {
  /** Enable dangerous command validation for Bash (default: true for security) */
  validateBash?: boolean | undefined;
  /** Additional patterns to block (regex strings) */
  customBlockPatterns?: readonly string[] | undefined;
  /** Whether to auto-allow all tools */
  autoAllow?: boolean | undefined;
  /** Tools that require user confirmation */
  requireConfirmation?: readonly string[] | undefined;
}

/** Dangerous command patterns for Bash validation. */
const DANGEROUS_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /rm\s+-rf\s+\/(?!\w)/, message: 'Dangerous: rm -rf on root directory' },
  { pattern: /rm\s+-rf\s+\/\*/, message: 'Dangerous: rm -rf /* detected' },
  { pattern: /rm\s+-rf\s+~\//, message: 'Dangerous: rm -rf on home directory' },
  { pattern: /chmod\s+777\s+\//, message: 'Dangerous: chmod 777 on system directory' },
  { pattern: />\s*\/dev\/sd[a-z]/, message: 'Dangerous: writing to block device' },
  { pattern: /mkfs\./, message: 'Dangerous: filesystem formatting command' },
  { pattern: /dd\s+if=.*of=\/dev\/sd/, message: 'Dangerous: dd to block device' },
  { pattern: /:\(\)\s*{\s*:\|:&\s*};\s*:/, message: 'Dangerous: fork bomb detected' },
  { pattern: /wget.*\|\s*sh/, message: 'Dangerous: piping wget to shell' },
  { pattern: /curl.*\|\s*sh/, message: 'Dangerous: piping curl to shell' },
  { pattern: /curl.*\|\s*bash/, message: 'Dangerous: piping curl to bash' },
];

/** Sensitive file patterns that should warn on modification. */
const SENSITIVE_FILES: ReadonlyArray<{ pattern: RegExp; warning: string }> = [
  { pattern: /\/etc\/passwd/, warning: 'Modifying system password file' },
  { pattern: /\/etc\/shadow/, warning: 'Modifying system shadow file' },
  { pattern: /\/etc\/sudoers/, warning: 'Modifying sudoers configuration' },
  { pattern: /~\/\.ssh\//, warning: 'Modifying SSH configuration' },
  { pattern: /\.env/, warning: 'Modifying environment file (may contain secrets)' },
];

/** Checks if auto-allow is configured. */
function shouldAutoAllow(config?: PreToolHandlerConfig): boolean {
  return config?.autoAllow === true;
}

/** Checks if tool requires confirmation. */
function requiresConfirmation(toolName: string, config?: PreToolHandlerConfig): boolean {
  return config?.requireConfirmation?.includes(toolName) === true;
}

/** Checks if Bash validation should run. */
function shouldValidateBash(toolName: string, config?: PreToolHandlerConfig): boolean {
  return config?.validateBash !== false && toolName === 'Bash';
}

/**
 * Handles PreToolUse hook event.
 */
export function handlePreTool(
  input: PreToolUseInput,
  config?: PreToolHandlerConfig
): Promise<HookResult> {
  if (shouldAutoAllow(config)) {
    return Promise.resolve(allowTool('Auto-allowed by configuration'));
  }

  if (requiresConfirmation(input.tool_name, config)) {
    return Promise.resolve(exitSuccess());
  }

  if (shouldValidateBash(input.tool_name, config)) {
    const result = validateBashTool(input, config?.customBlockPatterns);
    if (result !== null) return Promise.resolve(result);
  }

  logSensitiveFileAccess(input);
  return Promise.resolve(allowTool());
}

/** Validates Bash tool input for dangerous patterns. */
function validateBashTool(
  input: PreToolUseInput,
  customPatterns?: readonly string[]
): HookResult | null {
  const command = safeString(input.tool_input.command);
  const validationResult = validateBashCommand(command, customPatterns);

  if (validationResult !== null) {
    logger.warn('Blocked dangerous command', {
      toolUseId: input.tool_use_id,
      pattern: validationResult,
    });
    return denyTool(validationResult);
  }

  return null;
}

/** Logs sensitive file access for Edit/Write tools. */
function logSensitiveFileAccess(input: PreToolUseInput): void {
  if (input.tool_name !== 'Edit' && input.tool_name !== 'Write') return;

  const filePath = safeString(input.tool_input.file_path);
  const warning = checkSensitiveFile(filePath);

  if (warning !== null) {
    // Closes #2963 site 2: pre-fix this emitted at `info` (always-on)
    // with the full path of every .env/.ssh/AWS-cred touch — aggregated
    // in log services it built a map of where secrets live. Dropped to
    // `debug`; added `toolUseId` correlation field present in the
    // sibling `validateBashTool` call.
    logger.debug('Sensitive file access', {
      filePath,
      warning,
      toolUseId: input.tool_use_id,
    });
  }
}

/** Validates a Bash command against dangerous patterns. */
function validateBashCommand(command: string, customPatterns?: readonly string[]): string | null {
  // Check built-in dangerous patterns
  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return message;
  }

  // Check custom patterns if provided
  if (customPatterns !== undefined) {
    for (const patternStr of customPatterns) {
      const verdict = testCustomPattern(patternStr, command);
      // Fail closed on an unusable rule. This returned `false` — "did not
      // match" — so a single malformed regex in an operator's denylist made
      // the command ALLOWED, with a result indistinguishable from "evaluated
      // against every pattern and clean". `.rules/untrusted-input.md`
      // invariant 5 is fail-closed, and `codepr-guards.ts:735` already does
      // this correctly for a throwing guard.
      if (verdict === 'invalid') {
        logger.warn('Invalid custom block pattern — failing closed', { pattern: patternStr });
        return `Blocked: custom block pattern is not a valid regex: ${patternStr}`;
      }
      if (verdict === 'match') {
        return `Blocked by custom pattern: ${patternStr}`;
      }
    }
  }

  return null;
}

/**
 * Tests one custom block pattern.
 *
 * Tri-state on purpose: `'invalid'` is not `'no-match'`. Collapsing them is
 * what made an unusable rule read as a clean one — see the fail-closed branch
 * in {@link validateBashCommand}.
 */
type PatternVerdict = 'match' | 'no-match' | 'invalid';

function testCustomPattern(patternStr: string, command: string): PatternVerdict {
  try {
    return new RegExp(patternStr).test(command) ? 'match' : 'no-match';
  } catch {
    return 'invalid';
  }
}

/** Checks if a file path matches sensitive file patterns. */
function checkSensitiveFile(filePath: string): string | null {
  for (const { pattern, warning } of SENSITIVE_FILES) {
    if (pattern.test(filePath)) return warning;
  }
  return null;
}

/** Creates a modified tool input (e.g., for path sanitization). */
export function createModifiedInput(
  originalInput: Record<string, unknown>,
  modifications: Record<string, unknown>
): HookResult {
  return modifyToolInput({ ...originalInput, ...modifications });
}

export default handlePreTool;
