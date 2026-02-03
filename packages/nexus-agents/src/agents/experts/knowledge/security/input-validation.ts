/**
 * Input Validation Knowledge Module
 *
 * Validation rules by input type, sanitization patterns,
 * and injection prevention guidance.
 *
 * @module agents/experts/knowledge/security/input-validation
 * @see NIST 800-53: SI-10, SI-15
 * (Source: Epic #643 / Issue #645 - Phase 1a)
 */

import type { KnowledgeModule } from '../types.js';

export const INPUT_VALIDATION_MODULE: KnowledgeModule = {
  id: 'security-input-validation',
  domain: 'security',
  title: 'Input Validation and Sanitization',
  nistControls: ['SI-10', 'SI-15'],
  tags: ['input-validation', 'sanitization', 'injection-prevention', 'xss'],
  sections: [
    {
      title: 'Validation Strategy: Allowlist Over Denylist',
      content: [
        'PRINCIPLE: Define what IS valid, reject everything else',
        'ORDER OF OPERATIONS:',
        '  1. Type check (is it the expected type?)',
        '  2. Length/size check (within bounds?)',
        '  3. Format check (matches allowed pattern?)',
        '  4. Range/value check (within allowed values?)',
        '  5. Business logic check (makes sense in context?)',
        'RULES:',
        '  - Validate on server side (client validation is UX only)',
        '  - Validate at system boundaries (API entry, file upload, DB input)',
        '  - Use schema validation libraries (Zod, Joi) over manual checks',
        '  - Reject invalid input with 400 status, not silent transformation',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'Type-Specific Validation Rules',
      content: [
        'STRING:',
        '  - Max length: enforce per field (name: 255, bio: 2000)',
        '  - Character set: restrict to expected chars (alphanumeric + limited special)',
        '  - Encoding: normalize to UTF-8, reject overlong sequences',
        'EMAIL:',
        '  - Use RFC 5322 validation, max 254 chars total',
        '  - Reject emails without @ and domain part',
        '  - Verify via confirmation email, not regex alone',
        'URL:',
        '  - Allowlist schemes: https only (http for dev only)',
        '  - Reject javascript:, data:, file:, ftp: schemes',
        '  - Validate against URL parser, not regex',
        'NUMERIC:',
        '  - Define min/max bounds per field',
        '  - Reject NaN, Infinity, negative zero where inappropriate',
        '  - Use integer types where decimals are not expected',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'File Upload Validation',
      content: [
        'CHECKLIST:',
        '  - [ ] Validate MIME type via magic bytes, not just extension',
        '  - [ ] Enforce max file size (server-side, before full read)',
        '  - [ ] Allowlist file extensions (.pdf, .png, .jpg, .docx)',
        '  - [ ] Rename uploaded files (UUID-based, strip original name)',
        '  - [ ] Store outside web root, serve via signed URLs',
        '  - [ ] Scan for malware before processing',
        '  - [ ] Set Content-Disposition: attachment on download',
        'DENY: Executable extensions (.exe, .sh, .bat, .ps1, .jar)',
        'DENY: Double extensions (file.pdf.exe), null byte injection (file.pdf%00.exe)',
        'DENY: SVG uploads without sanitization (can contain scripts)',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Injection Prevention Patterns',
      content: [
        'SQL INJECTION:',
        '  - Use parameterized queries / prepared statements exclusively',
        '  - Never concatenate user input into SQL strings',
        '  - Use ORM query builders with parameter binding',
        '  - Escape identifiers (table/column names) separately',
        'XSS (Cross-Site Scripting):',
        '  - HTML-encode output by default (framework auto-escaping)',
        '  - Use Content-Security-Policy header to block inline scripts',
        '  - Sanitize rich text with allowlist-based sanitizer (DOMPurify)',
        '  - Set httpOnly on cookies to prevent JS access',
        'PATH TRAVERSAL:',
        '  - Resolve path and verify it starts with expected root',
        '  - Reject inputs containing ../ or ..\\',
        '  - Use path.resolve() then check prefix, not string matching',
        'COMMAND INJECTION:',
        '  - Avoid shell exec; use direct process spawn with arg arrays',
        '  - If shell required: use allowlisted commands only, no user input in args',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'HTML Sanitization',
      content: [
        'WHEN: Accepting rich text / HTML content from users',
        'APPROACH:',
        '  1. Parse HTML into DOM tree',
        '  2. Walk tree, remove elements not in allowlist',
        '  3. Remove attributes not in allowlist per element',
        '  4. Remove event handler attributes (onclick, onerror, etc.)',
        '  5. Serialize back to HTML string',
        'SAFE ELEMENTS: p, br, strong, em, ul, ol, li, a (href only), img (src only)',
        'DENY: script, iframe, object, embed, form, input, style, link, meta, base',
        'TOOLS: DOMPurify (browser/Node), sanitize-html (Node)',
        'RULE: Sanitize on input AND escape on output (defense in depth)',
      ].join('\n'),
      priority: 8,
    },
  ],
} as const;
