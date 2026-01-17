/**
 * nexus-agents/mcp/safety - Hazard Catalog
 *
 * Pre-defined hazards for common MCP tool categories.
 * This catalog serves as the knowledge base for STPA analysis.
 *
 * Tool categories:
 * - File operations (read, write, delete)
 * - Shell/command execution
 * - Network operations
 * - Database operations
 * - Authentication/authorization
 * - Agent orchestration
 */

import { type Hazard, HazardCategory, HazardSeverity, HazardLikelihood } from './stpa-types.js';

// Re-export from split modules
export { ToolCategory, classifyTool, classifyToolMultiple } from './tool-categories.js';
export {
  PATH_TRIGGER_PATTERNS,
  SHELL_TRIGGER_PATTERNS,
  NETWORK_TRIGGER_PATTERNS,
  getTriggerPatternsForCategory,
} from './trigger-patterns.js';

// Import ToolCategory and classifyToolMultiple for local use
import { ToolCategory, classifyToolMultiple } from './tool-categories.js';

// =============================================================================
// Hazard Definitions by Category
// =============================================================================

/**
 * Hazards associated with file read operations.
 */
export const FILE_READ_HAZARDS: readonly Hazard[] = [
  {
    id: 'H-FR-001',
    description: 'Unauthorized access to sensitive files outside allowed directories',
    category: HazardCategory.INFORMATION_DISCLOSURE,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.LIKELY,
    triggerConditions: ['Path traversal in file path', 'Symbolic link following', 'Absolute paths'],
    consequences: ['Exposure of credentials', 'Exposure of private data', 'System file disclosure'],
  },
  {
    id: 'H-FR-002',
    description: 'Reading extremely large files causing memory exhaustion',
    category: HazardCategory.RESOURCE_EXHAUSTION,
    severity: HazardSeverity.MEDIUM,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['No file size limits', 'Binary files', 'Generated files'],
    consequences: ['Process crash', 'System slowdown', 'Denial of service'],
  },
  {
    id: 'H-FR-003',
    description: 'Reading special device files causing system instability',
    category: HazardCategory.DENIAL_OF_SERVICE,
    severity: HazardSeverity.HIGH,
    likelihood: HazardLikelihood.UNLIKELY,
    triggerConditions: ['Access to /dev paths', 'Access to /proc paths', 'No file type validation'],
    consequences: ['Infinite read loops', 'System resource consumption', 'Process hang'],
  },
];

/**
 * Hazards associated with file write operations.
 */
export const FILE_WRITE_HAZARDS: readonly Hazard[] = [
  {
    id: 'H-FW-001',
    description: 'Overwriting critical system files or configuration',
    category: HazardCategory.DATA_LOSS,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['Path traversal', 'Absolute paths to system directories', 'No backup'],
    consequences: ['System configuration corruption', 'Application failure', 'Data loss'],
  },
  {
    id: 'H-FW-002',
    description: 'Creating files with malicious content that gets executed',
    category: HazardCategory.UNAUTHORIZED_EXECUTION,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: [
      'Writing to executable paths',
      'Writing script files',
      'No content validation',
    ],
    consequences: ['Code execution', 'Privilege escalation', 'System compromise'],
  },
  {
    id: 'H-FW-003',
    description: 'Disk space exhaustion through unbounded writes',
    category: HazardCategory.RESOURCE_EXHAUSTION,
    severity: HazardSeverity.MEDIUM,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['No size limits', 'Loop writing', 'Large content'],
    consequences: ['Disk full', 'System instability', 'Service failures'],
  },
  {
    id: 'H-FW-004',
    description: 'Writing credentials or secrets to files',
    category: HazardCategory.INFORMATION_DISCLOSURE,
    severity: HazardSeverity.HIGH,
    likelihood: HazardLikelihood.LIKELY,
    triggerConditions: ['Unfiltered content', 'Log files', 'Debugging output'],
    consequences: ['Credential exposure', 'Token leakage', 'API key compromise'],
  },
];

/**
 * Hazards associated with file delete operations.
 */
export const FILE_DELETE_HAZARDS: readonly Hazard[] = [
  {
    id: 'H-FD-001',
    description: 'Deletion of critical files or directories',
    category: HazardCategory.DATA_LOSS,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['Path traversal', 'Recursive deletion', 'Symbolic link following'],
    consequences: ['Permanent data loss', 'System failure', 'Service unavailability'],
  },
  {
    id: 'H-FD-002',
    description: 'Deletion of system files causing instability',
    category: HazardCategory.INTEGRITY_VIOLATION,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.UNLIKELY,
    triggerConditions: ['Access to system paths', 'Elevated privileges', 'No path restrictions'],
    consequences: ['System boot failure', 'Service crashes', 'Security controls disabled'],
  },
];

/**
 * Hazards associated with shell/command execution.
 */
export const SHELL_EXECUTE_HAZARDS: readonly Hazard[] = [
  {
    id: 'H-SH-001',
    description: 'Command injection through unsanitized input',
    category: HazardCategory.INJECTION,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.LIKELY,
    triggerConditions: ['Shell metacharacters in input', 'String concatenation', 'No escaping'],
    consequences: ['Arbitrary command execution', 'System compromise', 'Data theft'],
  },
  {
    id: 'H-SH-002',
    description: 'Execution of destructive commands (rm -rf, format, etc.)',
    category: HazardCategory.DATA_LOSS,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['No command allowlist', 'Recursive flags', 'Force flags'],
    consequences: ['Complete data loss', 'System destruction', 'Unrecoverable state'],
  },
  {
    id: 'H-SH-003',
    description: 'Network exfiltration through shell commands',
    category: HazardCategory.INFORMATION_DISCLOSURE,
    severity: HazardSeverity.HIGH,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['Network commands allowed', 'No egress filtering', 'curl/wget access'],
    consequences: ['Data exfiltration', 'Credential theft', 'Unauthorized uploads'],
  },
  {
    id: 'H-SH-004',
    description: 'Privilege escalation through shell commands',
    category: HazardCategory.PRIVILEGE_ESCALATION,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['sudo/su access', 'setuid binaries', 'capability manipulation'],
    consequences: ['Root access', 'Full system control', 'Persistent compromise'],
  },
  {
    id: 'H-SH-005',
    description: 'Fork bomb or resource exhaustion through shell',
    category: HazardCategory.DENIAL_OF_SERVICE,
    severity: HazardSeverity.HIGH,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['No process limits', 'Recursive commands', 'While loops'],
    consequences: ['System unresponsive', 'Process table exhaustion', 'Reboot required'],
  },
];

/**
 * Hazards associated with network operations.
 */
export const NETWORK_HAZARDS: readonly Hazard[] = [
  {
    id: 'H-NET-001',
    description: 'Server-Side Request Forgery (SSRF) to internal services',
    category: HazardCategory.UNAUTHORIZED_EXECUTION,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.LIKELY,
    triggerConditions: ['User-controlled URLs', 'No URL validation', 'Internal network access'],
    consequences: ['Internal service access', 'Metadata endpoint access', 'Credential theft'],
  },
  {
    id: 'H-NET-002',
    description: 'Data exfiltration to external endpoints',
    category: HazardCategory.INFORMATION_DISCLOSURE,
    severity: HazardSeverity.HIGH,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['Unrestricted outbound access', 'No domain allowlist', 'POST requests'],
    consequences: ['Sensitive data leak', 'Credential exposure', 'Privacy violation'],
  },
  {
    id: 'H-NET-003',
    description: 'Connection exhaustion through many concurrent requests',
    category: HazardCategory.RESOURCE_EXHAUSTION,
    severity: HazardSeverity.MEDIUM,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['No connection limits', 'No rate limiting', 'Parallel requests'],
    consequences: ['Connection pool exhaustion', 'Service unavailability', 'Timeout cascades'],
  },
];

/**
 * Hazards associated with database operations.
 */
export const DATABASE_HAZARDS: readonly Hazard[] = [
  {
    id: 'H-DB-001',
    description: 'SQL injection through unsanitized queries',
    category: HazardCategory.INJECTION,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.LIKELY,
    triggerConditions: ['String interpolation', 'No parameterized queries', 'Dynamic SQL'],
    consequences: ['Data breach', 'Data modification', 'Authentication bypass'],
  },
  {
    id: 'H-DB-002',
    description: 'Unauthorized data access beyond intended scope',
    category: HazardCategory.INFORMATION_DISCLOSURE,
    severity: HazardSeverity.HIGH,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['No row-level security', 'Missing WHERE clauses', 'SELECT *'],
    consequences: ['Data exposure', 'Privacy violation', 'Compliance breach'],
  },
  {
    id: 'H-DB-003',
    description: 'Data corruption through unvalidated modifications',
    category: HazardCategory.DATA_LOSS,
    severity: HazardSeverity.HIGH,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['No transaction boundaries', 'Missing constraints', 'Bulk updates'],
    consequences: [
      'Data integrity loss',
      'Referential integrity violation',
      'Cascading corruption',
    ],
  },
];

/**
 * Hazards associated with authentication/authorization operations.
 */
export const AUTH_HAZARDS: readonly Hazard[] = [
  {
    id: 'H-AUTH-001',
    description: 'Credential exposure through logging or error messages',
    category: HazardCategory.INFORMATION_DISCLOSURE,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.LIKELY,
    triggerConditions: ['Verbose logging', 'Error stack traces', 'Debug mode'],
    consequences: ['Credential theft', 'Account compromise', 'Lateral movement'],
  },
  {
    id: 'H-AUTH-002',
    description: 'Authentication bypass through token manipulation',
    category: HazardCategory.PRIVILEGE_ESCALATION,
    severity: HazardSeverity.CRITICAL,
    likelihood: HazardLikelihood.UNLIKELY,
    triggerConditions: ['Weak token validation', 'Predictable tokens', 'No signature verification'],
    consequences: ['Unauthorized access', 'Impersonation', 'Session hijacking'],
  },
];

/**
 * Hazards associated with agent orchestration operations.
 */
export const ORCHESTRATION_HAZARDS: readonly Hazard[] = [
  {
    id: 'H-ORCH-001',
    description: 'Prompt injection through task content',
    category: HazardCategory.INJECTION,
    severity: HazardSeverity.HIGH,
    likelihood: HazardLikelihood.LIKELY,
    triggerConditions: ['User-provided prompts', 'Untrusted task content', 'No input filtering'],
    consequences: ['Agent manipulation', 'Unauthorized actions', 'Data exfiltration'],
  },
  {
    id: 'H-ORCH-002',
    description: 'Agent loop causing unbounded resource consumption',
    category: HazardCategory.RESOURCE_EXHAUSTION,
    severity: HazardSeverity.MEDIUM,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['No iteration limits', 'Recursive delegation', 'Circular dependencies'],
    consequences: ['Token exhaustion', 'Cost overrun', 'System hang'],
  },
  {
    id: 'H-ORCH-003',
    description: 'Privilege escalation through expert delegation',
    category: HazardCategory.PRIVILEGE_ESCALATION,
    severity: HazardSeverity.HIGH,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: [
      'No capability restrictions',
      'Tool access inheritance',
      'Unrestricted experts',
    ],
    consequences: [
      'Unauthorized tool access',
      'Bypassed restrictions',
      'Security boundary violation',
    ],
  },
];

// =============================================================================
// Hazard Catalog by Category
// =============================================================================

/**
 * Complete hazard catalog indexed by tool category.
 */
export const HAZARD_CATALOG: ReadonlyMap<ToolCategory, readonly Hazard[]> = new Map([
  [ToolCategory.FILE_READ, FILE_READ_HAZARDS],
  [ToolCategory.FILE_WRITE, FILE_WRITE_HAZARDS],
  [ToolCategory.FILE_DELETE, FILE_DELETE_HAZARDS],
  [ToolCategory.SHELL_EXECUTE, SHELL_EXECUTE_HAZARDS],
  [ToolCategory.NETWORK_REQUEST, NETWORK_HAZARDS],
  [ToolCategory.DATABASE_QUERY, DATABASE_HAZARDS],
  [ToolCategory.DATABASE_MODIFY, DATABASE_HAZARDS],
  [ToolCategory.AUTHENTICATION, AUTH_HAZARDS],
  [ToolCategory.ORCHESTRATION, ORCHESTRATION_HAZARDS],
  [ToolCategory.MEMORY, []], // Memory operations typically low-risk
  [ToolCategory.UNKNOWN, []], // Unknown tools need manual analysis
]);

/**
 * Gets all hazards applicable to a tool based on its category.
 */
export function getHazardsForTool(toolName: string): readonly Hazard[] {
  const categories = classifyToolMultiple(toolName);
  const hazards: Hazard[] = [];

  for (const category of categories) {
    const categoryHazards = HAZARD_CATALOG.get(category);
    if (categoryHazards) {
      hazards.push(...categoryHazards);
    }
  }

  return hazards;
}
