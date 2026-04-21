/**
 * nexus-agents/agents - SecurityExpert Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SecurityExpert,
  createSecurityExpert,
  type SecurityExpertOptions,
} from './security-expert.js';
import type { Task, IModelAdapter, CompletionResponse, StreamChunk } from '../../core/index.js';
import { ok } from '../../core/index.js';
import { type SecurityAnalysisResult } from './expert-types.js';

/**
 * Create a mock model adapter for testing.
 */
function createMockAdapter(responseOverride?: Partial<CompletionResponse>): IModelAdapter {
  const defaultResponse: CompletionResponse = {
    model: 'test-model',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          content: 'Security analysis completed',
          vulnerabilities: [
            {
              id: 'VULN-001',
              severity: 'high',
              type: 'A01:2021 - Broken Access Control',
              description: 'Missing authorization check',
              location: 'auth.ts:45',
              remediation: 'Add role-based access control',
              cweId: 'CWE-284',
            },
          ],
          securityScore: 75,
          compliance: {
            framework: 'OWASP',
            status: 'partial',
            findings: ['Missing input validation'],
          },
          recommendations: ['Implement rate limiting'],
          confidence: 0.85,
        }),
      },
    ],
    usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    stopReason: 'end_turn',
    ...responseOverride,
  };

  return {
    providerId: 'test-provider',
    modelId: 'test-model',
    capabilities: ['completion'],
    complete: vi.fn().mockResolvedValue(ok(defaultResponse)),
    stream: vi.fn().mockImplementation(function* (): Iterable<StreamChunk> {
      yield { type: 'message_start', message: { model: 'test-model' } };
      yield { type: 'message_stop' };
    }),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
  };
}

/**
 * Create a test task.
 */
function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'test-task-1',
    description: 'Review the authentication module for security vulnerabilities',
    context: {
      workingDirectory: '/project',
      files: ['src/auth.ts'],
    },
    ...overrides,
  };
}

describe('SecurityExpert', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const expert = new SecurityExpert();

      expect(expert.id).toBe('security-expert');
      expect(expert.role).toBe('security_expert');
      expect(expert.capabilities).toContain('task_execution');
      expect(expert.capabilities).toContain('code_review');
      expect(expert.capabilities).toContain('research');
    });

    it('should accept custom id', () => {
      const expert = new SecurityExpert({ id: 'custom-security-expert' });

      expect(expert.id).toBe('custom-security-expert');
    });

    it('should apply custom temperature', () => {
      const expertOptions: SecurityExpertOptions = { temperature: 0.1 };
      const expert = new SecurityExpert({ expertOptions });

      expect(expert.getExpertOptions().temperature).toBe(0.1);
    });

    it('should store security-specific options', () => {
      const expertOptions: SecurityExpertOptions = {
        complianceFrameworks: ['OWASP', 'NIST'],
        minSeverity: 'medium',
        enableCweMapping: true,
        focusAreas: ['authentication', 'injection'],
      };
      const expert = new SecurityExpert({ expertOptions });

      const options = expert.getExpertOptions();
      expect(options.complianceFrameworks).toEqual(['OWASP', 'NIST']);
      expect(options.minSeverity).toBe('medium');
      expect(options.enableCweMapping).toBe(true);
      expect(options.focusAreas).toEqual(['authentication', 'injection']);
    });
  });

  describe('createSecurityExpert', () => {
    it('should create expert with factory function', () => {
      const expert = createSecurityExpert();

      expect(expert).toBeInstanceOf(SecurityExpert);
      expect(expert.id).toBe('security-expert');
    });

    it('should pass options through factory function', () => {
      const expert = createSecurityExpert({
        expertOptions: { minSeverity: 'high' },
      });

      expect(expert.getExpertOptions().minSeverity).toBe('high');
    });
  });

  describe('execute (heuristic mode)', () => {
    it('should execute task without adapter using heuristics', async () => {
      const expert = new SecurityExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('heuristic');

        const output = result.value.output as SecurityAnalysisResult;
        // Heuristic confidence is 0.6 when patterns match, 0.4 otherwise (#1404)
        expect(output.confidence).toBeLessThanOrEqual(0.7);
      }
    });

    it('should detect SQL injection vulnerability from description', async () => {
      const expert = new SecurityExpert();
      const task = createTestTask({
        description: 'Review the SQL query function for user input',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        expect(output.vulnerabilities.length).toBeGreaterThan(0);

        const sqlVuln = output.vulnerabilities.find((v) => v.type.includes('Injection'));
        expect(sqlVuln).toBeDefined();
        expect(sqlVuln?.severity).toBe('critical');
      }
    });

    it('should detect authentication issues', async () => {
      const expert = new SecurityExpert();
      const task = createTestTask({
        description: 'Review the login and session management code',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        const authVuln = output.vulnerabilities.find((v) => v.type.includes('Authentication'));
        expect(authVuln).toBeDefined();
      }
    });

    it('should detect access control issues', async () => {
      const expert = new SecurityExpert();
      const task = createTestTask({
        description: 'Review permission checking for admin access',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        const accessVuln = output.vulnerabilities.find((v) => v.type.includes('Access Control'));
        expect(accessVuln).toBeDefined();
      }
    });

    it('should calculate security score based on vulnerabilities', async () => {
      const expert = new SecurityExpert();
      const task = createTestTask({
        description: 'Review the password handling and authentication flow',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        expect(output.securityScore).toBeGreaterThanOrEqual(0);
        expect(output.securityScore).toBeLessThanOrEqual(100);
      }
    });

    it('should include CWE IDs when enabled', async () => {
      const expert = new SecurityExpert({
        expertOptions: { enableCweMapping: true },
      });
      const task = createTestTask({
        description: 'Review the eval and exec usage in the codebase',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        const vulnWithCwe = output.vulnerabilities.find((v) => v.cweId !== undefined);
        expect(vulnWithCwe).toBeDefined();
      }
    });

    it('should filter vulnerabilities by minimum severity', async () => {
      const expert = new SecurityExpert({
        expertOptions: { minSeverity: 'critical' },
      });
      const task = createTestTask({
        description: 'Review password storage and SQL queries and auth flow',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        for (const vuln of output.vulnerabilities) {
          expect(vuln.severity).toBe('critical');
        }
      }
    });

    it('should generate recommendations based on findings', async () => {
      const expert = new SecurityExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        expect(output.recommendations).toBeDefined();
        expect(output.recommendations?.length).toBeGreaterThan(0);
      }
    });

    it('should generate warnings for critical vulnerabilities', async () => {
      const expert = new SecurityExpert();
      const task = createTestTask({
        description: 'Review the eval() usage with user input in the shell command',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        expect(output.warnings).toBeDefined();
        expect(output.warnings?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('execute (with adapter)', () => {
    it('should execute task with model adapter', async () => {
      const adapter = createMockAdapter();
      const expert = new SecurityExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('test-model');
      }
    });

    it('should parse vulnerabilities from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new SecurityExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        expect(output.vulnerabilities).toHaveLength(1);
        expect(output.vulnerabilities[0]!.id).toBe('VULN-001');
        expect(output.vulnerabilities[0]!.severity).toBe('high');
        expect(output.vulnerabilities[0]!.cweId).toBe('CWE-284');
      }
    });

    it('should parse compliance status from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new SecurityExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        expect(output.compliance).toBeDefined();
        expect(output.compliance?.framework).toBe('OWASP');
        expect(output.compliance?.status).toBe('partial');
      }
    });

    it('should handle invalid vulnerability schema gracefully', async () => {
      const adapter = createMockAdapter({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              content: 'Analysis done',
              vulnerabilities: [
                { invalid: 'data' }, // Invalid vulnerability
                {
                  id: 'VALID-001',
                  severity: 'low',
                  type: 'Info',
                  description: 'Valid vuln',
                  remediation: 'Fix it',
                },
              ],
              securityScore: 90,
              confidence: 0.8,
            }),
          },
        ],
      });
      const expert = new SecurityExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        // Only valid vulnerability should be included
        expect(output.vulnerabilities).toHaveLength(1);
        expect(output.vulnerabilities[0]!.id).toBe('VALID-001');
      }
    });

    it('should handle non-JSON response gracefully', async () => {
      const adapter = createMockAdapter({
        content: [
          {
            type: 'text',
            text: 'No vulnerabilities found in the reviewed code.',
          },
        ],
      });
      const expert = new SecurityExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as SecurityAnalysisResult;
        expect(output.content).toBe('No vulnerabilities found in the reviewed code.');
        // Heuristic fallback: no patterns matched → empty vulns, score 100 (#1404)
        expect(output.vulnerabilities).toEqual([]);
        expect(output.securityScore).toBe(100);
      }
    });
  });

  describe('hasCapability', () => {
    it('should return true for code_review', () => {
      const expert = new SecurityExpert();

      expect(expert.hasCapability('code_review')).toBe(true);
    });

    it('should return true for research', () => {
      const expert = new SecurityExpert();

      expect(expert.hasCapability('research')).toBe(true);
    });

    it('should return false for code_generation', () => {
      const expert = new SecurityExpert();

      expect(expert.hasCapability('code_generation')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should reset state on cleanup', async () => {
      const expert = new SecurityExpert();
      const task = createTestTask();

      await expert.execute(task);
      await expert.cleanup();

      expect(expert.state).toBe('idle');
    });
  });
});
