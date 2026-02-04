/**
 * nexus-agents CLI Server Audit Integration
 *
 * Initializes structured audit logging from security configuration.
 *
 * @module cli-server-audit
 * (Source: Issue #740 Phase 2 - audit logging)
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ILogger } from './core/index.js';
import { createAuditLogger, type AuditLogger } from './audit/index.js';
import type { SecurityConfig } from './config/index.js';

/** Default audit log directory under ~/.nexus-agents. */
const DEFAULT_AUDIT_DIR = join(homedir(), '.nexus-agents', 'audit');

/**
 * Initializes the audit logger from security configuration.
 * Returns null if audit logging is not enabled.
 *
 * (Source: Issue #740 Phase 2 - wire audit to pipeline)
 */
export function initializeAuditLogger(
  securityConfig: SecurityConfig | undefined,
  logger: ILogger
): AuditLogger | null {
  if (securityConfig?.audit?.enabled !== true) {
    logger.debug('Audit logging disabled (set security.audit.enabled: true to enable)');
    return null;
  }

  const auditConfig = securityConfig.audit;
  const logDir = auditConfig.logDir ?? DEFAULT_AUDIT_DIR;
  const auditLogger = createAuditLogger(
    {
      logDir,
      minSeverity: auditConfig.minSeverity,
      enableHashChain: auditConfig.enableHashChain,
      maxFileSizeBytes: auditConfig.maxFileSizeBytes,
      maxFiles: auditConfig.maxFiles,
      filePrefix: 'audit',
      enableCompression: false,
      flushIntervalMs: 1000,
    },
    undefined,
    logger
  );

  auditLogger.logSystemStartup({ auditLogDir: logDir });
  logger.info('Audit logging enabled', { logDir });
  return auditLogger;
}

/**
 * Gracefully shuts down the audit logger, flushing pending events.
 */
export async function shutdownAuditLogger(
  auditLogger: AuditLogger | null,
  logger: ILogger
): Promise<void> {
  if (auditLogger === null) return;

  try {
    auditLogger.logSystemShutdown();
    await auditLogger.close();
    logger.info('Audit logger shutdown complete');
  } catch (error) {
    logger.error(
      'Error shutting down audit logger',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
