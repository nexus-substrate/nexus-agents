/**
 * Security Knowledge Modules
 *
 * Domain knowledge for enriching security expert agent prompts.
 * Contains OWASP, NIST, authentication, authorization, input validation,
 * secrets management, and threat modeling standards.
 *
 * @module agents/experts/knowledge/security
 * (Source: Epic #643 / Issue #645 - Phase 1a)
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
