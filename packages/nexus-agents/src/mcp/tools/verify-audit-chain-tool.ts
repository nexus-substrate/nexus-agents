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
import { toolError, toolSuccess, type BaseMcpToolDeps, type ToolResult } from './tool-result.js';
import { verifyChain, type ChainVerification } from '../../audit/audit-logger.js';
import { AuditEventSchema, type AuditEvent } from '../../audit/audit-types.js';

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
  readonly verification: ChainVerification;
}

export type VerifyAuditChainDeps = BaseMcpToolDeps;

/**
 * Read all audit-prefixed JSONL log files from `dir` in lexicographic order
 * and parse each line into an AuditEvent. Malformed lines are skipped with a
 * warning (matches the read-resilience policy in structured-task-state.ts).
 */
async function loadAuditEvents(
  dir: string,
  logger: HandlerContext['logger']
): Promise<{ events: AuditEvent[]; fileCount: number }> {
  const entries = await fs.readdir(dir);
  const auditFiles = entries
    .filter((name) => name.startsWith('audit-') && name.endsWith('.jsonl'))
    .sort();
  const events: AuditEvent[] = [];
  for (const filename of auditFiles) {
    const fullPath = path.join(dir, filename);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      logger.warn('Skipping unreadable audit log file', { filename, error: msg });
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
        }
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : String(cause);
        logger.warn('Skipping unparseable audit event', { filename, error: msg });
      }
    }
  }
  return { events, fileCount: auditFiles.length };
}

async function handler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = VerifyAuditChainInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolError(`Validation error: ${formatZodError(parsed.error)}`);
  }
  const resolvedDir = path.resolve(parsed.data.logDir);

  let dirStats;
  try {
    dirStats = await fs.stat(resolvedDir);
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return toolError(`Cannot access logDir "${resolvedDir}": ${msg}`);
  }
  if (!dirStats.isDirectory()) {
    return toolError(`logDir "${resolvedDir}" is not a directory`);
  }

  const { events, fileCount } = await loadAuditEvents(resolvedDir, ctx.logger);
  const verification = verifyChain(events);

  const response: VerifyAuditChainResponse = {
    logDir: resolvedDir,
    fileCount,
    eventCount: events.length,
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
    'Read-only — never writes or deletes events.';

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
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered verify_audit_chain tool');
}
