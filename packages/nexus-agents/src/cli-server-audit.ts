/**
 * nexus-agents CLI Server Audit & Security Config Integration
 *
 * Initializes structured audit logging and security configuration helpers.
 *
 * @module cli-server-audit
 * (Source: Issue #740 Phase 2 - audit logging and security config)
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ILogger } from './core/index.js';
import { createAuditLogger, type AuditLogger } from './audit/index.js';
import type { SecurityConfig, AppConfig } from './config/index.js';
import { createDefaultPolicyFirewall } from './mcp/middleware/index.js';

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

/** Gets policy values from config. */
export function getPolicyValues(config?: AppConfig): {
  mode: 'enforce' | 'warn';
  defaultExec: 'read-only' | 'read-write';
} {
  const policy = config?.security?.policy;
  return { mode: policy?.policyMode ?? 'enforce', defaultExec: policy?.defaultMode ?? 'read-only' };
}

/** Gets rate limit values from config. */
export function getRateLimitValues(config?: AppConfig): { enabled: boolean; rpm: number } {
  const rl = config?.security?.rateLimit;
  return { enabled: rl?.enabled ?? true, rpm: rl?.requestsPerMinute ?? 60 };
}

/**
 * Creates and configures policy firewall from config.
 * (Source: Issue #477 - Wire policy firewall to config)
 */
function createConfiguredPolicyFirewall(
  logger: ILogger,
  config?: AppConfig
): ReturnType<typeof createDefaultPolicyFirewall> {
  const policyVals = getPolicyValues(config);
  return createDefaultPolicyFirewall({ mode: policyVals.mode, logger });
}

/**
 * Logs security configuration at startup.
 * Returns the configured policy firewall for use in tool registration.
 * (Source: Issue #185 Phase 1 - Startup security logging)
 * (Source: Issue #477 - Wire policy firewall to config)
 */
export function logSecurityConfig(
  logger: ILogger,
  config?: AppConfig
): ReturnType<typeof createDefaultPolicyFirewall> {
  const policyFirewall = createConfiguredPolicyFirewall(logger, config);
  const authEnabled = process.env['NEXUS_AUTH_ENABLED'] === 'true';
  const policyVals = getPolicyValues(config);
  const rateLimitVals = getRateLimitValues(config);

  logger.info('Security configuration', {
    policyMode: policyVals.mode,
    defaultExecutionMode: policyVals.defaultExec,
    policyRuleCount: policyFirewall.getRules().length,
    authEnabled,
    authMethod: process.env['NEXUS_AUTH_METHOD'] ?? 'none',
    rateLimitEnabled: rateLimitVals.enabled,
    rateLimitRequestsPerMinute: rateLimitVals.rpm,
    allowedPaths: config?.security?.allowedPaths ?? ['./'],
  });

  if (!authEnabled) {
    logger.warn('Authentication is disabled. Set NEXUS_AUTH_ENABLED=true to enable.');
  }

  logger.debug('Policy firewall rules', {
    rules: policyFirewall.getRules().map((r) => ({ name: r.name, description: r.description })),
  });

  return policyFirewall;
}
