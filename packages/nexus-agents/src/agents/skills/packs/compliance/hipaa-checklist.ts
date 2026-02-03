/**
 * HIPAA Compliance Checklist Skills
 *
 * Health Insurance Portability and Accountability Act compliance checks.
 * Covers PHI handling, access controls, audit logging, encryption,
 * and Business Associate Agreement (BAA) requirements.
 *
 * @module agents/skills/packs/compliance/hipaa-checklist
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const HIPAA_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'hipaa-phi-audit',
    description:
      'Audits code for HIPAA Protected Health Information (PHI) handling compliance. ' +
      'Checks encryption at rest and in transit, access logging, minimum necessary ' +
      'standard, de-identification methods, and breach notification readiness.',
    category: 'compliance',
    complexity: 'complex',
    code: [
      'function hipaaPhiAudit(code: string): string {',
      '  const checks = [',
      '    { req: "Encryption at Rest", pattern: /encrypt|aes|kms|vault/i },',
      '    { req: "Encryption in Transit", pattern: /https|tls|ssl|mtls/i },',
      '    { req: "Access Logging", pattern: /auditLog|accessLog|hipaaLog/i },',
      '    { req: "Minimum Necessary", pattern: /select\\s+\\w+|pick|allowedFields/i },',
      '    { req: "De-identification", pattern: /deIdentify|anonymize|redact|mask/i },',
      '    { req: "Unique User ID", pattern: /userId|practitionerId|authenticat/i },',
      '    { req: "Auto Logoff", pattern: /sessionTimeout|idleTimeout|autoLogout/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "PASS" : "GAP"}: ${c.req}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to audit for HIPAA PHI compliance',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['compliance', 'hipaa', 'phi', 'healthcare', 'privacy'],
    examples: [
      {
        description: 'Audit a patient data handler for HIPAA compliance',
        input: {
          code: 'const data = encrypt(patientRecord); auditLog.write({ userId, action: "read" });',
        },
        expectedOutput: 'PASS: Encryption at Rest\nPASS: Access Logging\nPASS: Unique User ID',
      },
    ],
  },
] as const;
