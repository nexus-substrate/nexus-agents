/**
 * GDPR Data Handling Checklist Skills
 *
 * Compliance checks for EU General Data Protection Regulation.
 * Covers consent management, data subject rights, data processing,
 * and cross-border transfer requirements.
 *
 * @module agents/skills/packs/compliance/gdpr-checklist
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const GDPR_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'gdpr-data-handling-audit',
    description:
      'Audits code for GDPR data handling compliance. Checks consent collection, ' +
      'data minimization, purpose limitation, storage limitation, right to erasure, ' +
      'data portability, and breach notification readiness.',
    category: 'compliance',
    complexity: 'complex',
    code: [
      'function gdprDataHandlingAudit(code: string): string {',
      '  const checks = [',
      '    { req: "Consent Collection", pattern: /consent|optIn|gdprConsent/i },',
      '    { req: "Data Minimization", pattern: /pick|select|allowlist|whitelist/i },',
      '    { req: "Purpose Limitation", pattern: /purpose|processingReason|legalBasis/i },',
      '    { req: "Storage Limitation", pattern: /ttl|expir|retention|deleteAfter/i },',
      '    { req: "Right to Erasure", pattern: /deleteUser|eraseData|forgetMe/i },',
      '    { req: "Data Portability", pattern: /export|download|portability/i },',
      '    { req: "Breach Notification", pattern: /breach|incident|notifyAuthority/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "PASS" : "MISSING"}: ${c.req}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to audit for GDPR compliance',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['compliance', 'gdpr', 'privacy', 'data-protection', 'eu'],
    examples: [
      {
        description: 'Audit user service for GDPR compliance',
        input: {
          code: 'async function deleteUser(id) { await db.users.delete(id); await audit.log("erasure"); }',
        },
        expectedOutput: 'PASS: Right to Erasure',
      },
    ],
  },
  {
    name: 'gdpr-pii-detector',
    description:
      'Detects personally identifiable information (PII) fields in code and data models. ' +
      'Identifies names, emails, phone numbers, IP addresses, location data, biometric data, ' +
      'and flags fields requiring GDPR protection.',
    category: 'compliance',
    complexity: 'moderate',
    code: [
      'function gdprPiiDetector(code: string): string {',
      '  const piiPatterns = [',
      '    { field: "Name", pattern: /firstName|lastName|fullName|displayName/i },',
      '    { field: "Email", pattern: /email|emailAddress|userEmail/i },',
      '    { field: "Phone", pattern: /phone|mobile|telephone/i },',
      '    { field: "IP Address", pattern: /ipAddress|clientIp|remoteAddr/i },',
      '    { field: "Location", pattern: /latitude|longitude|geoLocation|address/i },',
      '    { field: "Financial", pattern: /creditCard|bankAccount|iban/i },',
      '    { field: "Health", pattern: /diagnosis|medication|healthRecord/i },',
      '  ];',
      '  const found = piiPatterns.filter(p => p.pattern.test(code));',
      '  return found.length === 0 ? "No PII detected" : found.map(f => `PII: ${f.field}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code or data model to scan for PII',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['compliance', 'gdpr', 'pii', 'privacy', 'data-classification'],
    examples: [
      {
        description: 'Detect PII in a user model',
        input: { code: 'interface User { firstName: string; email: string; loginCount: number; }' },
        expectedOutput: 'PII: Name\nPII: Email',
      },
    ],
  },
] as const;
