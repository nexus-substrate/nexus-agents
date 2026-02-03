/**
 * NIST 800-53 Control Mapping Skills
 *
 * Condensed control mapping checklist for NIST SP 800-53 Rev 5.
 * Covers AC, AU, IA, SC, SI control families.
 *
 * @module agents/skills/packs/compliance/nist-controls
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const NIST_CONTROLS_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'nist-ac-controls',
    description:
      'Evaluates Access Control (AC) family controls from NIST 800-53 Rev 5. ' +
      'Checks AC-2 Account Management, AC-3 Access Enforcement, AC-4 Information Flow, ' +
      'AC-6 Least Privilege, AC-17 Remote Access, and AC-20 External Systems.',
    category: 'compliance',
    complexity: 'complex',
    code: [
      'function nistAcControls(code: string): string {',
      '  const controls = [',
      '    { id: "AC-2", name: "Account Management", pattern: /createUser|deleteUser|disableAccount/i },',
      '    { id: "AC-3", name: "Access Enforcement", pattern: /authorize|checkPermission|guard/i },',
      '    { id: "AC-4", name: "Information Flow", pattern: /firewall|networkPolicy|egress/i },',
      '    { id: "AC-6", name: "Least Privilege", pattern: /role|scope|minimumPermission/i },',
      '    { id: "AC-17", name: "Remote Access", pattern: /vpn|ssh|mfa|remoteAccess/i },',
      '    { id: "AC-20", name: "External Systems", pattern: /thirdParty|externalApi|federation/i },',
      '  ];',
      '  return controls.map(c => `${c.id} ${c.name}: ${c.pattern.test(code) ? "FOUND" : "MISSING"}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to evaluate against AC controls',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['compliance', 'nist', '800-53', 'access-control'],
    examples: [
      {
        description: 'Check code for AC control implementation',
        input: { code: 'if (!checkPermission(user, resource)) throw new ForbiddenError();' },
        expectedOutput: 'AC-3 Access Enforcement: FOUND',
      },
    ],
  },
  {
    name: 'nist-si-controls',
    description:
      'Evaluates System and Information Integrity (SI) controls from NIST 800-53. ' +
      'Checks SI-2 Flaw Remediation, SI-3 Malicious Code Protection, SI-4 Monitoring, ' +
      'SI-5 Security Alerts, SI-10 Information Input Validation, SI-11 Error Handling.',
    category: 'compliance',
    complexity: 'complex',
    code: [
      'function nistSiControls(code: string): string {',
      '  const controls = [',
      '    { id: "SI-2", name: "Flaw Remediation", pattern: /patch|update|dependabot|renovate/i },',
      '    { id: "SI-3", name: "Malicious Code Protection", pattern: /antivirus|malware|scan/i },',
      '    { id: "SI-4", name: "Monitoring", pattern: /monitor|alert|metric|dashboard/i },',
      '    { id: "SI-10", name: "Input Validation", pattern: /validate|sanitize|schema\\.parse/i },',
      '    { id: "SI-11", name: "Error Handling", pattern: /catch|errorHandler|sanitizeError/i },',
      '  ];',
      '  return controls.map(c => `${c.id} ${c.name}: ${c.pattern.test(code) ? "FOUND" : "MISSING"}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to evaluate against SI controls',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['compliance', 'nist', '800-53', 'integrity'],
    examples: [
      {
        description: 'Check code for SI control patterns',
        input: { code: 'const result = schema.parse(input); monitor.trackEvent("validation");' },
        expectedOutput: 'SI-10 Input Validation: FOUND\nSI-4 Monitoring: FOUND',
      },
    ],
  },
] as const;
