/**
 * Input Validation Tests
 *
 * Tests that all MCP tool inputs are properly validated using Zod schemas.
 * Verifies edge cases, malformed inputs, and type coercion behavior.
 *
 * (Source: Issue #108)
 */

import { describe, it, expect } from 'vitest';

// Import tool schemas
import { OrchestrateInputSchema } from './../mcp/tools/orchestrate.js';
import { DelegateInputSchema } from './../mcp/tools/delegate-to-model.js';
import { CreateExpertInputSchema } from './../mcp/tools/create-expert.js';
import { RunWorkflowInputSchema } from './../mcp/tools/run-workflow.js';

describe('Input Validation - Zod Schemas', () => {
  describe('OrchestrateInputSchema', () => {
    it('should reject empty task', () => {
      const result = OrchestrateInputSchema.safeParse({ task: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing task', () => {
      const result = OrchestrateInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid task', () => {
      const result = OrchestrateInputSchema.safeParse({ task: 'Review this code' });
      expect(result.success).toBe(true);
    });

    it('should reject task that is not a string', () => {
      const result = OrchestrateInputSchema.safeParse({ task: 123 });
      expect(result.success).toBe(false);
    });

    it('should reject maxIterations out of range', () => {
      const result1 = OrchestrateInputSchema.safeParse({ task: 'test', maxIterations: 0 });
      expect(result1.success).toBe(false);

      const result2 = OrchestrateInputSchema.safeParse({ task: 'test', maxIterations: 100 });
      expect(result2.success).toBe(false);
    });

    it('should accept maxIterations within range', () => {
      const result = OrchestrateInputSchema.safeParse({ task: 'test', maxIterations: 25 });
      expect(result.success).toBe(true);
    });

    it('should handle prototype pollution attempts', () => {
      const maliciousInput = {
        task: 'test',
        __proto__: { isAdmin: true },
        constructor: { prototype: { isAdmin: true } },
      };
      const result = OrchestrateInputSchema.safeParse(maliciousInput);
      // Should parse only recognized fields - extra fields are stripped
      expect(result.success).toBe(true);
      if (result.success) {
        // The parsed result should not have isAdmin
        expect((result.data as Record<string, unknown>).isAdmin).toBeUndefined();
        // Zod strips unknown fields, so malicious fields should not appear as own properties
        expect(Object.hasOwn(result.data, '__proto__')).toBe(false);
      }
    });
  });

  describe('DelegateInputSchema', () => {
    it('should reject empty task', () => {
      const result = DelegateInputSchema.safeParse({ task: '' });
      expect(result.success).toBe(false);
    });

    it('should accept valid preferred_capability values', () => {
      const validCapabilities = ['reasoning', 'context', 'speed', 'code'];
      for (const cap of validCapabilities) {
        const result = DelegateInputSchema.safeParse({
          task: 'test',
          preferred_capability: cap,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid preferred_capability', () => {
      const result = DelegateInputSchema.safeParse({
        task: 'test',
        preferred_capability: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject task strings exceeding max length (CWE-20)', () => {
      const longTask = 'a'.repeat(100000);
      const result = DelegateInputSchema.safeParse({ task: longTask });
      expect(result.success).toBe(false);
    });

    it('should accept task strings within max length', () => {
      const validTask = 'a'.repeat(50000);
      const result = DelegateInputSchema.safeParse({ task: validTask });
      expect(result.success).toBe(true);
    });
  });

  describe('CreateExpertInputSchema', () => {
    const VALID_ROLES = [
      'code_expert',
      'architecture_expert',
      'security_expert',
      'documentation_expert',
      'testing_expert',
    ] as const;

    it('should accept all valid roles', () => {
      for (const role of VALID_ROLES) {
        const result = CreateExpertInputSchema.safeParse({ role });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid role', () => {
      const result = CreateExpertInputSchema.safeParse({ role: 'admin_expert' });
      expect(result.success).toBe(false);
    });

    it('should reject missing role', () => {
      const result = CreateExpertInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept optional modelPreference', () => {
      const result = CreateExpertInputSchema.safeParse({
        role: 'code_expert',
        modelPreference: 'claude-sonnet-4',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('RunWorkflowInputSchema', () => {
    it('should reject empty template', () => {
      const result = RunWorkflowInputSchema.safeParse({
        template: '',
        inputs: {},
      });
      expect(result.success).toBe(false);
    });

    it('should require inputs object', () => {
      const result = RunWorkflowInputSchema.safeParse({
        template: 'code-review',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid inputs', () => {
      const result = RunWorkflowInputSchema.safeParse({
        template: 'code-review',
        inputs: { files: ['src/main.ts'], options: { strict: true } },
      });
      expect(result.success).toBe(true);
    });

    it('should accept dryRun boolean', () => {
      const result = RunWorkflowInputSchema.safeParse({
        template: 'code-review',
        inputs: {},
        dryRun: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dryRun).toBe(true);
      }
    });
  });

  describe('Common Attack Patterns', () => {
    const schemas = [
      { name: 'Orchestrate', schema: OrchestrateInputSchema, validInput: { task: 'test' } },
      { name: 'Delegate', schema: DelegateInputSchema, validInput: { task: 'test' } },
      {
        name: 'CreateExpert',
        schema: CreateExpertInputSchema,
        validInput: { role: 'code_expert' },
      },
      {
        name: 'RunWorkflow',
        schema: RunWorkflowInputSchema,
        validInput: { template: 'test', inputs: {} },
      },
    ];

    schemas.forEach(({ name, schema }) => {
      describe(`${name}Schema`, () => {
        it('should reject null input', () => {
          const result = schema.safeParse(null);
          expect(result.success).toBe(false);
        });

        it('should reject undefined input', () => {
          const result = schema.safeParse(undefined);
          expect(result.success).toBe(false);
        });

        it('should reject array input', () => {
          const result = schema.safeParse([]);
          expect(result.success).toBe(false);
        });

        it('should reject string input', () => {
          const result = schema.safeParse('invalid');
          expect(result.success).toBe(false);
        });

        it('should reject number input', () => {
          const result = schema.safeParse(42);
          expect(result.success).toBe(false);
        });
      });
    });
  });

  describe('SQL/NoSQL Injection Patterns (Defense in Depth)', () => {
    const injectionPatterns = [
      "'; DROP TABLE users; --",
      '{ "$gt": "" }',
      '{ "$where": "sleep(5000)" }',
      "1' OR '1'='1",
      'admin" OR "1"="1',
      '{"$ne": null}',
    ];

    it('should accept injection patterns as strings (no SQL/NoSQL in this layer)', () => {
      // These should be accepted as valid task strings
      // The security comes from not using them in database queries
      for (const pattern of injectionPatterns) {
        const result = OrchestrateInputSchema.safeParse({ task: pattern });
        expect(result.success).toBe(true);
      }
    });
  });
});
