/**
 * nexus-agents/mcp - Verify Audit Chain MCP Tool (#2281 follow-up).
 *
 * Read-only MCP tool that reads the persisted audit log files from a
 * `FileAuditStorage`-style directory and runs `verifyChain()` against the
 * recovered events. Returns a structured tamper-detection result.
 *
 * Operator value: confirms at any point that no event has been retroactively
 * modified, dropped, or partially-corrupted since it was written. Without
 * this tool, the hash-chain shipped in audit-logger.ts is decorative —
 * nothing reads the chain back and validates.
 *
 * Security model: this tool is read-only; it never writes or deletes audit
 * events. It only fails closed if the directory can't be read.
 *
 * @module mcp/tools/verify-audit-chain-tool
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { verifyChain, withCoverage, type ChainVerification } from '../../audit/audit-logger.js';
import { AuditEventSchema, type AuditEvent } from '../../audit/audit-types.js';
import { getToolAnnotations } from '../tool-annotations.js';

export const VerifyAuditChainInputSchema = z.object({
  logDir: z
    .string()
    .min(1)
    .max(512)
    .describe(
      'Filesystem path to the FileAuditStorage log directory. Tool reads all `audit-*.jsonl` files in lexicographic order and verifies the combined chain.'
    ),
});

export type VerifyAuditChainInput = z.infer<typeof VerifyAuditChainInputSchema>;

export interface VerifyAuditChainResponse {
  readonly logDir: string;
  readonly fileCount: number;
  readonly eventCount: number;
  /**
   * Lines the loader could not turn into an event (#4787).
   *
   * `eventCount` counts what parsed, not what the log contained, so a verdict
   * over a partially-read log used to be reported identically to one over the
   * whole thing. Omitted when zero: absent means full coverage, a number means
   * the verdict below covers `eventCount` of `eventCount + skippedLines` lines.
   */
  readonly skippedLines?: number;
  /** Files that could not be opened at all (#4787). Omitted when zero. */
  readonly unreadableFiles?: number;
  readonly verification: ChainVerification;
}

export type VerifyAuditChainDeps = BaseMcpToolDeps;

/**
 * Read all audit-prefixed JSONL log files from `dir` in lexicographic order
 * and parse each line into an AuditEvent. Malformed lines are skipped with a
 * warning (matches the read-resilience policy in structured-task-state.ts).
 *
 * Skips are COUNTED as well as logged (#4787). Resilient reading is the right
 * policy for an audit reader — one corrupt line should not blind the verifier
 * to the rest — but the caller has to be told how much was dropped, or a
 * partial verdict is indistinguishable from a complete one.
 */
async function loadAuditEvents(
  dir: string,
  logger: HandlerContext['logger']
): Promise<{
  events: AuditEvent[];
  fileCount: number;
  skippedLines: number;
  unreadableFiles: number;
}> {
  const entries = await fs.readdir(dir);
  const auditFiles = entries
    .filter((name) => name.startsWith('audit-') && name.endsWith('.jsonl'))
    .sort();
  const events: AuditEvent[] = [];
  let skippedLines = 0;
  let unreadableFiles = 0;
  for (const filename of auditFiles) {
    const fullPath = path.join(dir, filename);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      logger.warn('Skipping unreadable audit log file', { filename, error: msg });
      unreadableFiles++;
      continue;
    }
    for (const line of content.split('\n')) {
      if (line.length === 0) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        const validated = AuditEventSchema.safeParse(parsed);
        if (validated.success) {
          events.push(validated.data);
        } else {
          logger.warn('Skipping malformed audit event', {
            filename,
            error: validated.error.message,
          });
          skippedLines++;
        }
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : String(cause);
        logger.warn('Skipping unparseable audit event', { filename, error: msg });
        skippedLines++;
      }
    }
  }
  return { events, fileCount: auditFiles.length, skippedLines, unreadableFiles };
}

async function handler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = VerifyAuditChainInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }
  const resolvedDir = path.resolve(parsed.data.logDir);

  let dirStats;
  try {
    dirStats = await fs.stat(resolvedDir);
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Cannot access logDir "${resolvedDir}": ${msg}`,
    });
  }
  if (!dirStats.isDirectory()) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `logDir "${resolvedDir}" is not a directory`,
    });
  }

  const { events, fileCount, skippedLines, unreadableFiles } = await loadAuditEvents(
    resolvedDir,
    ctx.logger
  );
  // The loader is the only party that knows what was skipped, so it is the one
  // that can state coverage on the verdict itself (#4805).
  const verification = withCoverage(verifyChain(events), {
    skipped: skippedLines,
    unreadableFiles,
  });

  // Omitted when zero so absence means full coverage rather than "unreported".
  const response: VerifyAuditChainResponse = {
    logDir: resolvedDir,
    fileCount,
    eventCount: events.length,
    ...(skippedLines > 0 ? { skippedLines } : {}),
    ...(unreadableFiles > 0 ? { unreadableFiles } : {}),
    verification,
  };
  return toolSuccess(JSON.stringify(response, null, 2));
}

/** @category MCP */
export function registerVerifyAuditChainTool(server: McpServer, deps: VerifyAuditChainDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'verify_audit_chain' });
  const toolSchema = {
    logDir: z
      .string()
      .min(1)
      .max(512)
      .describe(
        'Filesystem path to the FileAuditStorage log directory. Tool reads all `audit-*.jsonl` files and verifies the combined hash chain.'
      ),
  };

  const description =
    'Verify the hash chain of a persisted FileAuditStorage audit log. ' +
    'Reads all `audit-*.jsonl` files in the given directory, parses events, ' +
    'and runs `verifyChain()` to detect tampering. Returns a structured ' +
    'result with eventCount, fileCount, and one of three tamper signals if ' +
    'detected (hash_mismatch, previous_hash_mismatch, missing_hash). ' +
    'Reports skippedLines/unreadableFiles when part of the log could not be ' +
    'read, so a verdict over a partial log is never mistaken for a complete ' +
    'one. Read-only — never writes or deletes events.';

  const secureHandler = createSecureHandler(handler, {
    toolName: 'verify_audit_chain',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('verify_audit_chain', deps.security);
  const wrappedHandler = wrapToolWithTimeout('verify_audit_chain', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'verify_audit_chain',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('verify_audit_chain') },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered verify_audit_chain tool');
}
