/**
 * nexus-agents/agents - Code Generation Constitution
 *
 * Default constitution for evaluating code generation quality.
 * Based on security best practices, OWASP guidelines, and
 * clean code principles.
 *
 * @module agents/collaboration/constitutions/code
 * (Source: arXiv:2212.08073, Issue #147)
 */

import type { Constitution } from '../constitutional-types.js';

/**
 * Default code generation constitution.
 */
export const CODE_CONSTITUTION: Constitution = {
  id: 'code-generation-v1',
  version: '1.0.0',
  name: 'Code Generation Constitution',
  description: 'Principles for safe, secure, and maintainable code generation',
  principles: [
    {
      id: 'no-secrets',
      name: 'No Hardcoded Secrets',
      description: 'Code must not contain hardcoded credentials, API keys, tokens, or passwords',
      category: 'security',
      defaultSeverity: 'critical',
      examples: [
        {
          violation: 'const API_KEY = "sk-abc123...";',
          correction: 'const API_KEY = process.env.API_KEY;',
          explanation: 'Hardcoded API keys can be leaked in version control',
        },
        {
          violation: 'password: "admin123"',
          correction: 'password: await vault.getSecret("db-password")',
          explanation: 'Passwords should come from secure storage',
        },
      ],
    },
    {
      id: 'input-validation',
      name: 'Input Validation',
      description: 'All external inputs must be validated before use',
      category: 'security',
      defaultSeverity: 'high',
      examples: [
        {
          violation: 'const data = JSON.parse(userInput);',
          correction: 'const result = Schema.safeParse(JSON.parse(userInput));',
          explanation: 'Unvalidated input can lead to injection attacks',
        },
        {
          violation: 'fs.readFileSync(req.params.filename)',
          correction: 'const safePath = validatePath(req.params.filename, allowedDir);',
          explanation: 'Path parameters must be validated to prevent traversal',
        },
      ],
    },
    {
      id: 'error-handling',
      name: 'Proper Error Handling',
      description: 'All fallible operations must have appropriate error handling',
      category: 'quality',
      defaultSeverity: 'high',
      examples: [
        {
          violation: 'const data = await fetch(url).then(r => r.json());',
          correction: 'try { const res = await fetch(url); if (!res.ok) throw...',
          explanation: 'Network requests can fail and must be handled',
        },
        {
          violation: 'const file = fs.readFileSync(path);',
          correction: 'try { const file = fs.readFileSync(path); } catch (e) { ... }',
          explanation: 'File operations should handle missing files gracefully',
        },
      ],
    },
    {
      id: 'no-console',
      name: 'No Production Console Logs',
      description: 'Production code should use proper logging, not console.log',
      category: 'quality',
      defaultSeverity: 'medium',
      examples: [
        {
          violation: 'console.log("Processing:", data);',
          correction: 'logger.debug("Processing data", { id: data.id });',
          explanation: 'Console logs can leak sensitive data and lack structure',
        },
      ],
    },
    {
      id: 'type-safety',
      name: 'Type Safety',
      description: 'Code should use proper TypeScript types, avoiding any',
      category: 'quality',
      defaultSeverity: 'medium',
      examples: [
        {
          violation: 'function process(data: any) { ... }',
          correction: 'function process(data: ProcessInput) { ... }',
          explanation: 'Using any defeats the purpose of TypeScript',
        },
        {
          violation: 'const result = value as SomeType;',
          correction: 'const result = Schema.parse(value);',
          explanation: 'Type assertions bypass runtime validation',
        },
      ],
    },
    {
      id: 'no-eval',
      name: 'No Dynamic Code Execution',
      description: 'Code must not use eval, Function constructor, or similar',
      category: 'security',
      defaultSeverity: 'critical',
      examples: [
        {
          violation: 'eval(userExpression)',
          correction: 'Use a safe expression parser or whitelist',
          explanation: 'eval enables arbitrary code execution',
        },
        {
          violation: 'new Function("return " + expr)()',
          correction: 'Use a sandboxed math parser library',
          explanation: 'Function constructor is equivalent to eval',
        },
      ],
    },
    {
      id: 'sql-injection',
      name: 'SQL Injection Prevention',
      description: 'SQL queries must use parameterized queries, never string interpolation',
      category: 'security',
      defaultSeverity: 'critical',
      examples: [
        {
          violation: '`SELECT * FROM users WHERE id = ${userId}`',
          correction: 'db.query("SELECT * FROM users WHERE id = ?", [userId])',
          explanation: 'String interpolation in SQL enables injection attacks',
        },
      ],
    },
    {
      id: 'dependency-safety',
      name: 'Safe Dependency Usage',
      description: 'External dependencies should be from trusted sources with pinned versions',
      category: 'security',
      defaultSeverity: 'medium',
      examples: [
        {
          violation: 'import foo from "random-npm-package"',
          correction: 'Use well-maintained packages with security audits',
          explanation: 'Untrusted packages may contain malicious code',
        },
      ],
    },
  ],
  updatedAt: new Date('2026-01-09'),
};

/**
 * Get all critical principles from the code constitution.
 */
export function getCriticalPrinciples(): string[] {
  return CODE_CONSTITUTION.principles
    .filter((p) => p.defaultSeverity === 'critical')
    .map((p) => p.id);
}

/**
 * Get principles by category.
 */
export function getPrinciplesByCategory(category: string): typeof CODE_CONSTITUTION.principles {
  return CODE_CONSTITUTION.principles.filter((p) => p.category === category);
}
