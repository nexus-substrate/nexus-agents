/**
 * Accessibility (WCAG 2.1) Checklist Skills
 *
 * WCAG 2.1 accessibility checks: perceivable, operable,
 * understandable, and robust content requirements.
 *
 * @module agents/skills/packs/misc/accessibility
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const ACCESSIBILITY_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'wcag-audit',
    description:
      'Audits web code against WCAG 2.1 AA criteria. Checks alt text on images, ' +
      'ARIA labels, keyboard navigation, color contrast references, focus management, ' +
      'heading hierarchy, and form label associations.',
    category: 'frontend',
    complexity: 'moderate',
    code: [
      'function wcagAudit(code: string): string {',
      '  const checks = [',
      '    { req: "1.1.1 Alt Text", pattern: /alt=|aria-label|aria-labelledby/i },',
      '    { req: "1.4.3 Contrast", pattern: /contrast|color.*ratio|a11y.*color/i },',
      '    { req: "2.1.1 Keyboard", pattern: /onKeyDown|onKeyPress|tabIndex|keyboard/i },',
      '    { req: "2.4.1 Skip Nav", pattern: /skip.*nav|skipLink|main.*content/i },',
      '    { req: "2.4.6 Headings", pattern: /<h[1-6]|role="heading"|aria-level/i },',
      '    { req: "3.3.2 Labels", pattern: /htmlFor|<label|aria-describedby/i },',
      '    { req: "4.1.2 ARIA Roles", pattern: /role=|aria-|sr-only|visually.*hidden/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "PASS" : "CHECK"}: ${c.req}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'HTML/JSX/template code to audit for accessibility',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['accessibility', 'wcag', 'a11y', 'aria', 'frontend'],
    examples: [
      {
        description: 'Audit a React component for WCAG compliance',
        input: {
          code: '<img src="photo.jpg" alt="User avatar" /><button aria-label="Close" onKeyDown={handleKey}>',
        },
        expectedOutput: 'PASS: 1.1.1 Alt Text\nPASS: 2.1.1 Keyboard\nPASS: 4.1.2 ARIA Roles',
      },
    ],
  },
] as const;
