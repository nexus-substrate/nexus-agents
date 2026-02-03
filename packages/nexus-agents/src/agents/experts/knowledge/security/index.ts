/**
 * Security Knowledge Modules
 *
 * Domain knowledge for enriching security expert agent prompts.
 * Contains OWASP, NIST, authentication, authorization, input validation,
 * secrets management, and threat modeling standards.
 *
 * @module agents/experts/knowledge/security
 * (Source: Epic #643 / Issue #645 - Phase 1a, Phase 5a)
 */

import type { KnowledgeModule } from '../types.js';
import { OWASP_API_TOP10_MODULE } from './owasp-api-top10.js';
import { AUTHENTICATION_MODULE } from './authentication.js';
import { AUTHORIZATION_MODULE } from './authorization.js';
import { INPUT_VALIDATION_MODULE } from './input-validation.js';
import { SECRETS_MANAGEMENT_MODULE } from './secrets-management.js';
import { THREAT_MODELING_MODULE } from './threat-modeling.js';
import { NIST_CONTROLS_MODULE } from './nist-controls.js';

export {
  OWASP_API_TOP10_MODULE,
  AUTHENTICATION_MODULE,
  AUTHORIZATION_MODULE,
  INPUT_VALIDATION_MODULE,
  SECRETS_MANAGEMENT_MODULE,
  THREAT_MODELING_MODULE,
  NIST_CONTROLS_MODULE,
};

/**
 * All security domain knowledge modules.
 * Registered with the KnowledgeRegistry for injection into security expert prompts.
 */
export const SECURITY_KNOWLEDGE_MODULES: readonly KnowledgeModule[] = [
  OWASP_API_TOP10_MODULE,
  AUTHENTICATION_MODULE,
  AUTHORIZATION_MODULE,
  INPUT_VALIDATION_MODULE,
  SECRETS_MANAGEMENT_MODULE,
  THREAT_MODELING_MODULE,
  NIST_CONTROLS_MODULE,
];

/**
 * Common security domain patterns for quick reference injection.
 */
export const SECURITY_DOMAIN_PATTERNS = {
  authN: 'MFA + short-lived tokens (<15 min) + refresh rotation; rate-limit login attempts',
  authZ: 'Per-object authorization checks; deny by default; validate resource ownership',
  inputValidation: 'Validate at boundaries with schemas; reject unknown fields; sanitize output',
  secretsManagement: 'Vault or OIDC for credentials; rotate on schedule; never log secrets',
  threatModeling: 'STRIDE per DFD element; focus on trust boundary crossings; prioritize by risk',
} as const;

/**
 * Security best practices summary for prompt injection.
 */
export const SECURITY_BEST_PRACTICES = {
  owaspTop10: 'Check every endpoint for BOLA, broken auth, injection, misconfiguration',
  defenseInDepth: 'Multiple layers: input validation + authZ + encryption + monitoring',
  leastPrivilege: 'Minimum required permissions; scope IAM roles tightly; audit regularly',
  secureDefaults: 'Encryption on by default; strict CORS; security headers; no debug in prod',
  incidentResponse: 'Log security events; alert on anomalies; have a response playbook',
} as const;

/**
 * Build a formatted knowledge prompt for security expert prompt injection.
 *
 * @returns Formatted string with security domain knowledge
 */
export function getSecurityKnowledgePrompt(): string {
  const sections = SECURITY_KNOWLEDGE_MODULES.flatMap((module) => module.sections)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);

  const formatted = sections
    .map((section) => `### ${section.title}\n${section.content}`)
    .join('\n\n');

  return `## Security Domain Knowledge\n\n${formatted}`;
}
