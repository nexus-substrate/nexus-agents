/**
 * `run_quality_gate` MCP tool (#3356 Step 1).
 *
 * Thin MCP surface over the existing `runQualityGate` QA-validation engine
 * (`security/quality-gate.ts`, #1684). Lets an agent run the same allowlisted
 * checks the quality-gated pipeline runs — typecheck / lint / tests / build /
 * security — against a project directory and get back the structured
 * `{ stage, verdict, checks[], summary, feedback }` verdict.
 *
 * Security posture (BINDING vote conditions):
 *  1. `projectDir` is resolved against the repo/cwd root via the shared
 *     `resolveInsideRoot` guard (security/safe-path.ts). A path that escapes
 *     the root, doesn't exist, or isn't a directory is rejected with a
 *     structured error — never throws, never reaches a shell.
 *  2. Check selection is an **allowlist**: the Zod enum maps each name to a
 *     fixed factory. No arbitrary command string is ever constructed here.
 *  3. Per-check `details` are already capped at 500 chars by the engine, so
 *     the response cannot dump unbounded logs.
 *  4. Failures return a structured error envelope, not an exception.
 *
 * @module mcp/tools/quality-gate-tool
 */

import { statSync } from 'node:fs';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createLogger, formatZodError, type ILogger } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { getToolAnnotations } from '../tool-annotations.js';
import { resolveInsideRoot } from '../../security/safe-path.js';
import {
  runQualityGate,
  checkTypeCheck,
  checkLint,
  checkTests,
  checkBuild,
  type GateCheckFn,
} from '../../security/quality-gate.js';
import { checkSecurityScan } from '../../pipeline/security-gate.js';

/** Allowlisted check names. The enum is the only path by which a check can be selected. */
export const QualityCheckSchema = z.enum(['typecheck', 'lint', 'tests', 'build', 'security']);
export type QualityCheck = z.infer<typeof QualityCheckSchema>;

const DEFAULT_CHECKS: readonly QualityCheck[] = ['typecheck', 'lint', 'tests'];

export const RunQualityGateInputSchema = z.object({
  /** Project directory to run checks against. Must resolve inside the repo/cwd root. */
  projectDir: z
    .string()
    .optional()
    .describe(
      'Project directory to run checks against (default: cwd). Must stay inside the repo root.'
    ),
  /** Which allowlisted checks to run. */
  checks: z
    .array(QualityCheckSchema)
    .nonempty()
    .default([...DEFAULT_CHECKS])
    .describe("Allowlisted checks to run (default: ['typecheck','lint','tests'])."),
  /** 1-based iteration counter, forwarded to the engine for feedback context. */
  iteration: z.number().int().min(1).default(1).describe('1-based iteration number (default 1).'),
});
export type RunQualityGateInput = z.infer<typeof RunQualityGateInputSchema>;

export type RunQualityGateDeps = BaseMcpToolDeps;

/**
 * Validate `projectDir`: resolve inside the cwd/repo root, then confirm it
 * exists and is a directory. Returns the safe absolute path, or a structured
 * error ToolResult the caller returns verbatim.
 */
function validateProjectDir(raw: string | undefined): { dir: string } | { error: ToolResult } {
  const candidate = raw ?? process.cwd();
  const safe = resolveInsideRoot(candidate);
  if (safe === null) {
    return {
      error: toolStructuredError({
        errorCategory: 'permission',
        message: `Invalid projectDir: "${candidate}" resolves outside the repository root (path traversal rejected).`,
      }),
    };
  }
  let stat;
  try {
    stat = statSync(safe);
  } catch {
    return {
      error: toolStructuredError({
        errorCategory: 'validation',
        message: `Invalid projectDir: "${candidate}" does not exist.`,
      }),
    };
  }
  if (!stat.isDirectory()) {
    return {
      error: toolStructuredError({
        errorCategory: 'validation',
        message: `Invalid projectDir: "${candidate}" is not a directory.`,
      }),
    };
  }
  return { dir: safe };
}

/** Map an allowlisted check name to its fixed engine factory. */
function buildCheck(name: QualityCheck, projectDir: string): GateCheckFn {
  switch (name) {
    case 'typecheck':
      return checkTypeCheck(projectDir);
    case 'lint':
      return checkLint(projectDir);
    case 'tests':
      return checkTests(projectDir);
    case 'build':
      return checkBuild(projectDir);
    case 'security':
      return checkSecurityScan(projectDir);
  }
}

async function runQualityGateHandler(args: unknown, logger: ILogger): Promise<ToolResult> {
  const parsed = RunQualityGateInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }
  const { projectDir, checks, iteration } = parsed.data;

  const validated = validateProjectDir(projectDir);
  if ('error' in validated) return validated.error;

  const checkFns = checks.map((name) => buildCheck(name, validated.dir));
  logger.info('Running quality gate', { checks, iteration });

  // The engine catches per-check failures and returns pass/fail details; it
  // does not throw on a failing check. Guard the call anyway so any unexpected
  // engine error surfaces as a predictable structured envelope.
  try {
    const result = await runQualityGate('qa', checkFns, iteration);
    return toolSuccess(JSON.stringify(result, null, 2));
  } catch (err) {
    return toolStructuredError({
      errorCategory: 'internal',
      message: `Quality gate execution failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

const DESCRIPTION =
  'Run the QA quality gate (#1684 engine) against a project directory. ' +
  'Allowlisted checks: typecheck | lint | tests | build | security ' +
  "(default ['typecheck','lint','tests']). Returns the structured " +
  '{ stage, verdict, checks[], summary, feedback } verdict. projectDir must ' +
  'stay inside the repository root; per-check output is capped at 500 chars.';

/** @category MCP */
export function registerRunQualityGateTool(server: McpServer, deps: RunQualityGateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run_quality_gate' });
  const toolSchema = {
    projectDir: z
      .string()
      .optional()
      .describe(
        'Project directory to run checks against (default: cwd). Must stay inside the repo root.'
      ),
    checks: z
      .array(QualityCheckSchema)
      .nonempty()
      .optional()
      .describe("Allowlisted checks to run (default: ['typecheck','lint','tests'])."),
    iteration: z.number().int().min(1).optional().describe('1-based iteration number (default 1).'),
  };

  const secureHandler = createSecureHandler(
    (args: unknown) => runQualityGateHandler(args, logger),
    {
      toolName: 'run_quality_gate',
      rateLimiter: deps.rateLimiter,
      logger,
    }
  );

  const timeoutMs = getToolTimeout('run_quality_gate', deps.security);
  const wrappedHandler = wrapToolWithTimeout('run_quality_gate', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'run_quality_gate',
    {
      description: DESCRIPTION,
      inputSchema: toolSchema,
      annotations: getToolAnnotations('run_quality_gate'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered run_quality_gate tool');
}
