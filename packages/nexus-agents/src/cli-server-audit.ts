/**
 * nexus-agents CLI Server Audit & Security Config Integration
 *
 * Initializes structured audit logging and security configuration helpers.
 *
 * @module cli-server-audit
 * (Source: Issue #740 Phase 2 - audit logging and security config)
 */

import type { ILogger } from './core/index.js';
import { createAuditLogger, type AuditLogger } from './audit/index.js';
import type { SecurityConfig, AppConfig } from './config/index.js';
import { nexusDataPath } from './config/nexus-data-dir.js';
import { createDefaultPolicyFirewall } from './mcp/middleware/index.js';

/** Default audit log directory under the resolved nexus data dir (#2302). */
const DEFAULT_AUDIT_DIR = nexusDataPath('audit');

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
      maxQueueDepth: 10_000,
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

/** Resolves auth state from env var and config. (Issue #739) */
function getAuthValues(config?: AppConfig): { enabled: boolean; method: string } {
  const envAuth = process.env['NEXUS_AUTH_ENABLED'];
  const configAuth = config?.security?.auth;
  const enabled = envAuth === 'true' || (configAuth?.enabled ?? false);
  const method = configAuth?.method ?? process.env['NEXUS_AUTH_METHOD'] ?? 'none';
  return { enabled, method };
}

/**
 * Warns when no tamper-evident event chain is being written (#4990).
 *
 * The same treatment authentication already gets. A boolean on the info line is
 * easy to scroll past; a security control that is absent deserves to be as
 * visible as auth being absent.
 */
function warnIfAuditDisabled(auditEnabled: boolean, logger: ILogger): void {
  if (auditEnabled) return;
  logger.warn(
    'Audit logging is disabled — no tamper-evident event chain is being written. ' +
      'Set security.audit.enabled: true to enable it.'
  );
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
  const authVals = getAuthValues(config);
  const policyVals = getPolicyValues(config);
  const rateLimitVals = getRateLimitValues(config);
  const auditEnabled = config?.security?.audit?.enabled === true;

  logger.info('Security configuration', {
    // #4888: named `configuredPolicyMode`, not `policyMode`. This runs at
    // startup, before `stagePolicyFirewallForRollout` forces the firewall to
    // `warn` — the mode that actually applies. A field called `policyMode`
    // reading `enforce` here would claim an enforcement that does not happen.
    configuredPolicyMode: policyVals.mode,
    defaultExecutionMode: policyVals.defaultExec,
    policyRuleCount: policyFirewall.getRules().length,
    authEnabled: authVals.enabled,
    authMethod: authVals.method,
    rateLimitEnabled: rateLimitVals.enabled,
    rateLimitRequestsPerMinute: rateLimitVals.rpm,
    // #4990: audit was the only security control missing from this line, and
    // `initializeAuditLogger` announces its absence at `debug` — dropped at the
    // default level. So the tamper-evident chain the docs lead with could be
    // off while the startup log confirmed four other controls and said nothing
    // about this one, which reads as fine rather than absent.
    auditEnabled,
    allowedPaths: config?.security?.allowedPaths ?? ['./'],
  });

  warnIfAuditDisabled(auditEnabled, logger);

  if (!authVals.enabled) {
    logger.warn(
      'Authentication explicitly disabled — network-exposed endpoints are unprotected. Remove NEXUS_AUTH_ENABLED=false to re-enable.'
    );
  }

  logger.debug('Policy firewall rules', {
    rules: policyFirewall.getRules().map((r) => ({ name: r.name, description: r.description })),
  });

  return policyFirewall;
}
