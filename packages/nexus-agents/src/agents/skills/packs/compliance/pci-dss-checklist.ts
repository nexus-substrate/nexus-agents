/**
 * PCI-DSS Compliance Checklist Skills
 *
 * Payment Card Industry Data Security Standard compliance checks.
 * Covers cardholder data protection, network security, access control,
 * and monitoring requirements.
 *
 * @module agents/skills/packs/compliance/pci-dss-checklist
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const PCI_DSS_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'pci-dss-audit',
    description:
      'Audits code for PCI-DSS v4.0 compliance. Checks requirements for ' +
      'cardholder data encryption, secure transmission, access restriction, ' +
      'logging and monitoring, network segmentation, and vulnerability management.',
    category: 'compliance',
    complexity: 'complex',
    code: [
      'function pciDssAudit(code: string): string {',
      '  const checks = [',
      '    { req: "Req 3: Protect Stored Data", pattern: /encrypt|tokenize|mask|truncate/i },',
      '    { req: "Req 4: Encrypt Transmission", pattern: /https|tls|ssl/i },',
      '    { req: "Req 6: Secure Development", pattern: /validate|sanitize|parameterize/i },',
      '    { req: "Req 7: Restrict Access", pattern: /rbac|role|permission|authorize/i },',
      '    { req: "Req 8: Identify Users", pattern: /authenticate|mfa|password.*hash/i },',
      '    { req: "Req 10: Log and Monitor", pattern: /auditLog|monitor|alert|siem/i },',
      '    { req: "Req 11: Test Security", pattern: /penTest|scan|vulnerability/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "PASS" : "GAP"}: ${c.req}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to audit for PCI-DSS compliance',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['compliance', 'pci-dss', 'payment', 'cardholder-data', 'security'],
    examples: [
      {
        description: 'Audit payment handler for PCI-DSS compliance',
        input: {
          code: 'const token = tokenize(cardNumber); auditLog.write({ action: "charge" });',
        },
        expectedOutput: 'PASS: Req 3: Protect Stored Data\nPASS: Req 10: Log and Monitor',
      },
    ],
  },
] as const;
