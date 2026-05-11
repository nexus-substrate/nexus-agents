import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  ArtifactType,
  ARTIFACT_SCHEMA_VERSION,
  ArtifactTypeSchema,
  ArtifactMetadataSchema,
  createArtifact,
  createArtifactSchema,
  isArtifact,
  isArtifactOfType,
  deriveArtifact,
  type ArtifactTypeValue,
} from './artifact.js';

describe('Artifact', () => {
  describe('ArtifactType', () => {
    it('has all expected type values', () => {
      expect(ArtifactType.PLAN).toBe('plan');
      expect(ArtifactType.ANALYSIS).toBe('analysis');
      expect(ArtifactType.DECISION).toBe('decision');
      expect(ArtifactType.RESULT).toBe('result');
      expect(ArtifactType.INTENT).toBe('intent');
    });

    it('is a const object with correct types', () => {
      const types = Object.values(ArtifactType);
      expect(types).toHaveLength(5);
      expect(types).toContain('plan');
      expect(types).toContain('analysis');
      expect(types).toContain('decision');
      expect(types).toContain('result');
      expect(types).toContain('intent');
    });
  });

  describe('ArtifactTypeSchema', () => {
    it('validates valid artifact types', () => {
      expect(ArtifactTypeSchema.safeParse('plan').success).toBe(true);
      expect(ArtifactTypeSchema.safeParse('analysis').success).toBe(true);
      expect(ArtifactTypeSchema.safeParse('decision').success).toBe(true);
      expect(ArtifactTypeSchema.safeParse('result').success).toBe(true);
      expect(ArtifactTypeSchema.safeParse('intent').success).toBe(true);
    });

    it('rejects invalid artifact types', () => {
      expect(ArtifactTypeSchema.safeParse('invalid').success).toBe(false);
      expect(ArtifactTypeSchema.safeParse('').success).toBe(false);
      expect(ArtifactTypeSchema.safeParse(123).success).toBe(false);
      expect(ArtifactTypeSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('ArtifactMetadataSchema', () => {
    it('validates valid metadata', () => {
      const validMetadata = {
        createdAt: '2026-01-04T10:00:00.000Z',
        createdBy: 'agent-001',
        taskId: 'task-123',
      };
      const result = ArtifactMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it('validates metadata with optional fields', () => {
      const validMetadata = {
        createdAt: '2026-01-04T10:00:00.000Z',
        createdBy: 'agent-001',
        taskId: 'task-123',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        traceId: 'trace-abc-123',
      };
      const result = ArtifactMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it('rejects invalid createdAt format', () => {
      const invalidMetadata = {
        createdAt: 'not-a-date',
        createdBy: 'agent-001',
        taskId: 'task-123',
      };
      const result = ArtifactMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });

    it('rejects empty createdBy', () => {
      const invalidMetadata = {
        createdAt: '2026-01-04T10:00:00.000Z',
        createdBy: '',
        taskId: 'task-123',
      };
      const result = ArtifactMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });

    it('rejects empty taskId', () => {
      const invalidMetadata = {
        createdAt: '2026-01-04T10:00:00.000Z',
        createdBy: 'agent-001',
        taskId: '',
      };
      const result = ArtifactMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });

    it('rejects invalid parentId UUID format', () => {
      const invalidMetadata = {
        createdAt: '2026-01-04T10:00:00.000Z',
        createdBy: 'agent-001',
        taskId: 'task-123',
        parentId: 'not-a-uuid',
      };
      const result = ArtifactMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });
  });

  describe('createArtifact()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-04T12:00:00.000Z'));
    });

    it('creates an artifact with auto-generated fields', () => {
      const artifact = createArtifact(
        ArtifactType.PLAN,
        { steps: ['step1', 'step2'] },
        { createdBy: 'agent-001', taskId: 'task-123' }
      );

      expect(artifact.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(artifact.type).toBe('plan');
      expect(artifact.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
      expect(artifact.data).toEqual({ steps: ['step1', 'step2'] });
      expect(artifact.metadata.createdAt).toBe('2026-01-04T12:00:00.000Z');
      expect(artifact.metadata.createdBy).toBe('agent-001');
      expect(artifact.metadata.taskId).toBe('task-123');
    });

    it('includes optional metadata fields when provided', () => {
      const artifact = createArtifact(
        ArtifactType.ANALYSIS,
        { findings: [] },
        {
          createdBy: 'agent-002',
          taskId: 'task-456',
          parentId: '550e8400-e29b-41d4-a716-446655440000',
          traceId: 'trace-xyz',
        }
      );

      expect(artifact.metadata.parentId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(artifact.metadata.traceId).toBe('trace-xyz');
    });

    it('generates unique IDs for each artifact', () => {
      const artifact1 = createArtifact(
        ArtifactType.RESULT,
        {},
        { createdBy: 'agent', taskId: 'task' }
      );
      const artifact2 = createArtifact(
        ArtifactType.RESULT,
        {},
        { createdBy: 'agent', taskId: 'task' }
      );

      expect(artifact1.id).not.toBe(artifact2.id);
    });

    it('works with various data types', () => {
      const stringArtifact = createArtifact(ArtifactType.RESULT, 'simple string', {
        createdBy: 'agent',
        taskId: 'task',
      });
      expect(stringArtifact.data).toBe('simple string');

      const arrayArtifact = createArtifact(ArtifactType.RESULT, [1, 2, 3], {
        createdBy: 'agent',
        taskId: 'task',
      });
      expect(arrayArtifact.data).toEqual([1, 2, 3]);

      const nullArtifact = createArtifact(ArtifactType.RESULT, null, {
        createdBy: 'agent',
        taskId: 'task',
      });
      expect(nullArtifact.data).toBeNull();
    });
  });

  describe('createArtifactSchema()', () => {
    it('creates a schema that validates correct artifacts', () => {
      const PlanDataSchema = z.object({
        steps: z.array(z.string()),
        duration: z.number().optional(),
      });

      const PlanArtifactSchema = createArtifactSchema(PlanDataSchema);

      const validArtifact = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'plan',
        schemaVersion: '1.0.0',
        data: { steps: ['analyze', 'implement'] },
        metadata: {
          createdAt: '2026-01-04T10:00:00.000Z',
          createdBy: 'agent-001',
          taskId: 'task-123',
        },
      };

      const result = PlanArtifactSchema.safeParse(validArtifact);
      expect(result.success).toBe(true);
    });

    it('rejects artifacts with invalid data', () => {
      const PlanDataSchema = z.object({
        steps: z.array(z.string()),
      });

      const PlanArtifactSchema = createArtifactSchema(PlanDataSchema);

      const invalidArtifact = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'plan',
        schemaVersion: '1.0.0',
        data: { steps: 'not-an-array' }, // Invalid: should be array
        metadata: {
          createdAt: '2026-01-04T10:00:00.000Z',
          createdBy: 'agent-001',
          taskId: 'task-123',
        },
      };

      const result = PlanArtifactSchema.safeParse(invalidArtifact);
      expect(result.success).toBe(false);
    });

    it('rejects artifacts with invalid UUID', () => {
      const SimpleSchema = createArtifactSchema(z.unknown());

      const invalidArtifact = {
        id: 'not-a-uuid',
        type: 'plan',
        schemaVersion: '1.0.0',
        data: {},
        metadata: {
          createdAt: '2026-01-04T10:00:00.000Z',
          createdBy: 'agent-001',
          taskId: 'task-123',
        },
      };

      const result = SimpleSchema.safeParse(invalidArtifact);
      expect(result.success).toBe(false);
    });

    it('rejects artifacts with invalid schemaVersion', () => {
      const SimpleSchema = createArtifactSchema(z.unknown());

      const invalidArtifact = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'plan',
        schemaVersion: 'not-semver',
        data: {},
        metadata: {
          createdAt: '2026-01-04T10:00:00.000Z',
          createdBy: 'agent-001',
          taskId: 'task-123',
        },
      };

      const result = SimpleSchema.safeParse(invalidArtifact);
      expect(result.success).toBe(false);
    });
  });

  describe('isArtifact()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-04T12:00:00.000Z'));
    });

    it('returns true for valid artifacts', () => {
      const artifact = createArtifact(
        ArtifactType.DECISION,
        { action: 'proceed' },
        { createdBy: 'agent', taskId: 'task' }
      );

      expect(isArtifact(artifact)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isArtifact(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isArtifact(undefined)).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isArtifact('string')).toBe(false);
      expect(isArtifact(123)).toBe(false);
      expect(isArtifact(true)).toBe(false);
    });

    it('returns false for objects missing required fields', () => {
      expect(isArtifact({})).toBe(false);
      expect(isArtifact({ id: '123' })).toBe(false);
      expect(isArtifact({ id: '123', type: 'plan' })).toBe(false);
    });

    it('returns false for objects with invalid field values', () => {
      expect(
        isArtifact({
          id: 'not-uuid',
          type: 'plan',
          schemaVersion: '1.0.0',
          data: {},
          metadata: {
            createdAt: '2026-01-04T10:00:00.000Z',
            createdBy: 'agent',
            taskId: 'task',
          },
        })
      ).toBe(false);
    });

    it('narrows type correctly when true', () => {
      const maybeArtifact: unknown = createArtifact(
        ArtifactType.RESULT,
        { value: 42 },
        { createdBy: 'agent', taskId: 'task' }
      );

      if (isArtifact(maybeArtifact)) {
        // TypeScript should allow access to artifact fields
        expect(maybeArtifact.id).toBeDefined();
        expect(maybeArtifact.type).toBeDefined();
        expect(maybeArtifact.metadata.createdBy).toBe('agent');
      } else {
        // Should not reach here
        expect.fail('Expected isArtifact to return true');
      }
    });
  });

  describe('isArtifactOfType()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-04T12:00:00.000Z'));
    });

    it('returns true for artifacts matching the type', () => {
      const planArtifact = createArtifact(
        ArtifactType.PLAN,
        {},
        { createdBy: 'agent', taskId: 'task' }
      );

      expect(isArtifactOfType(planArtifact, ArtifactType.PLAN)).toBe(true);
    });

    it('returns false for artifacts not matching the type', () => {
      const planArtifact = createArtifact(
        ArtifactType.PLAN,
        {},
        { createdBy: 'agent', taskId: 'task' }
      );

      expect(isArtifactOfType(planArtifact, ArtifactType.ANALYSIS)).toBe(false);
      expect(isArtifactOfType(planArtifact, ArtifactType.DECISION)).toBe(false);
    });

    it('returns false for non-artifacts', () => {
      expect(isArtifactOfType(null, ArtifactType.PLAN)).toBe(false);
      expect(isArtifactOfType({}, ArtifactType.PLAN)).toBe(false);
      expect(isArtifactOfType('string', ArtifactType.PLAN)).toBe(false);
    });

    it('works with all artifact types', () => {
      const types: ArtifactTypeValue[] = [
        ArtifactType.PLAN,
        ArtifactType.ANALYSIS,
        ArtifactType.DECISION,
        ArtifactType.RESULT,
        ArtifactType.INTENT,
      ];

      for (const type of types) {
        const artifact = createArtifact(type, {}, { createdBy: 'agent', taskId: 'task' });
        expect(isArtifactOfType(artifact, type)).toBe(true);
      }
    });
  });

  describe('deriveArtifact()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-04T12:00:00.000Z'));
    });

    it('creates a derived artifact with parentId set', () => {
      const parent = createArtifact(
        ArtifactType.ANALYSIS,
        { findings: ['issue-1'] },
        { createdBy: 'analyzer', taskId: 'task-123' }
      );

      const derived = deriveArtifact(
        ArtifactType.DECISION,
        { action: 'fix' },
        parent,
        'decision-maker'
      );

      expect(derived.type).toBe('decision');
      expect(derived.data).toEqual({ action: 'fix' });
      expect(derived.metadata.parentId).toBe(parent.id);
      expect(derived.metadata.createdBy).toBe('decision-maker');
      expect(derived.metadata.taskId).toBe('task-123');
    });

    it('inherits traceId from parent', () => {
      const parent = createArtifact(
        ArtifactType.PLAN,
        {},
        { createdBy: 'planner', taskId: 'task-456', traceId: 'trace-abc' }
      );

      const derived = deriveArtifact(ArtifactType.RESULT, {}, parent, 'executor');

      expect(derived.metadata.traceId).toBe('trace-abc');
    });

    it('inherits taskId from parent', () => {
      const parent = createArtifact(
        ArtifactType.INTENT,
        { intent: 'create-file' },
        { createdBy: 'agent-1', taskId: 'shared-task' }
      );

      const derived = deriveArtifact(ArtifactType.RESULT, { success: true }, parent, 'agent-2');

      expect(derived.metadata.taskId).toBe('shared-task');
    });

    it('generates new unique ID for derived artifact', () => {
      const parent = createArtifact(
        ArtifactType.ANALYSIS,
        {},
        { createdBy: 'agent', taskId: 'task' }
      );

      const derived = deriveArtifact(ArtifactType.DECISION, {}, parent, 'agent');

      expect(derived.id).not.toBe(parent.id);
      expect(derived.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('supports chaining derivations', () => {
      const plan = createArtifact(
        ArtifactType.PLAN,
        { steps: ['a', 'b'] },
        { createdBy: 'planner', taskId: 'task-chain', traceId: 'trace-1' }
      );

      const analysis = deriveArtifact(ArtifactType.ANALYSIS, { analyzed: true }, plan, 'analyzer');

      const decision = deriveArtifact(
        ArtifactType.DECISION,
        { proceed: true },
        analysis,
        'decider'
      );

      const result = deriveArtifact(ArtifactType.RESULT, { completed: true }, decision, 'executor');

      // Check chain
      expect(analysis.metadata.parentId).toBe(plan.id);
      expect(decision.metadata.parentId).toBe(analysis.id);
      expect(result.metadata.parentId).toBe(decision.id);

      // All share same task and trace
      expect(analysis.metadata.taskId).toBe('task-chain');
      expect(decision.metadata.taskId).toBe('task-chain');
      expect(result.metadata.taskId).toBe('task-chain');

      expect(analysis.metadata.traceId).toBe('trace-1');
      expect(decision.metadata.traceId).toBe('trace-1');
      expect(result.metadata.traceId).toBe('trace-1');
    });
  });

  describe('ARTIFACT_SCHEMA_VERSION', () => {
    it('is a valid semver string', () => {
      expect(ARTIFACT_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('is version 1.0.0', () => {
      expect(ARTIFACT_SCHEMA_VERSION).toBe('1.0.0');
    });
  });
});
