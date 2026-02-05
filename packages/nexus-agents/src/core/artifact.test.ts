/**
 * Tests for artifact provenance envelope utilities
 *
 * @module core/artifact.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  ARTIFACT_SCHEMA_VERSION,
  ArtifactType,
  ArtifactTypeSchema,
  ArtifactMetadataSchema,
  createArtifactSchema,
  createArtifact,
  isArtifact,
  isArtifactOfType,
  deriveArtifact,
} from './artifact.js';
import { setTimeProvider, resetTimeProvider, FixedTimeProvider } from './time-provider.js';

describe('artifact', () => {
  beforeEach(() => {
    setTimeProvider(new FixedTimeProvider(new Date('2024-06-15T12:00:00Z')));
  });

  afterEach(() => {
    resetTimeProvider();
  });

  describe('ARTIFACT_SCHEMA_VERSION', () => {
    it('is a valid semver string', () => {
      expect(ARTIFACT_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('ArtifactType', () => {
    it('has all expected types', () => {
      expect(ArtifactType.PLAN).toBe('plan');
      expect(ArtifactType.ANALYSIS).toBe('analysis');
      expect(ArtifactType.DECISION).toBe('decision');
      expect(ArtifactType.RESULT).toBe('result');
      expect(ArtifactType.INTENT).toBe('intent');
    });
  });

  describe('ArtifactTypeSchema', () => {
    it('accepts valid artifact types', () => {
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
    });
  });

  describe('ArtifactMetadataSchema', () => {
    it('accepts valid metadata', () => {
      const metadata = {
        createdAt: '2024-06-15T12:00:00.000Z',
        createdBy: 'agent-001',
        taskId: 'task-123',
      };
      const result = ArtifactMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('accepts metadata with optional fields', () => {
      const metadata = {
        createdAt: '2024-06-15T12:00:00.000Z',
        createdBy: 'agent-001',
        taskId: 'task-123',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        traceId: 'trace-abc',
      };
      const result = ArtifactMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('rejects invalid createdAt format', () => {
      const metadata = {
        createdAt: 'not-a-date',
        createdBy: 'agent-001',
        taskId: 'task-123',
      };
      const result = ArtifactMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('rejects empty createdBy', () => {
      const metadata = {
        createdAt: '2024-06-15T12:00:00.000Z',
        createdBy: '',
        taskId: 'task-123',
      };
      const result = ArtifactMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('rejects invalid parentId (non-UUID)', () => {
      const metadata = {
        createdAt: '2024-06-15T12:00:00.000Z',
        createdBy: 'agent-001',
        taskId: 'task-123',
        parentId: 'not-a-uuid',
      };
      const result = ArtifactMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe('createArtifactSchema', () => {
    it('creates a schema for typed data', () => {
      const dataSchema = z.object({
        steps: z.array(z.string()),
        estimatedDuration: z.number(),
      });
      const artifactSchema = createArtifactSchema(dataSchema);

      const artifact = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'plan',
        schemaVersion: '1.0.0',
        data: { steps: ['step1', 'step2'], estimatedDuration: 3600 },
        metadata: {
          createdAt: '2024-06-15T12:00:00.000Z',
          createdBy: 'agent-001',
          taskId: 'task-123',
        },
      };

      const result = artifactSchema.safeParse(artifact);
      expect(result.success).toBe(true);
    });

    it('rejects invalid data', () => {
      const dataSchema = z.object({ value: z.number() });
      const artifactSchema = createArtifactSchema(dataSchema);

      const artifact = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'plan',
        schemaVersion: '1.0.0',
        data: { value: 'not a number' },
        metadata: {
          createdAt: '2024-06-15T12:00:00.000Z',
          createdBy: 'agent-001',
          taskId: 'task-123',
        },
      };

      const result = artifactSchema.safeParse(artifact);
      expect(result.success).toBe(false);
    });

    it('rejects invalid schemaVersion format', () => {
      const dataSchema = z.object({ value: z.string() });
      const artifactSchema = createArtifactSchema(dataSchema);

      const artifact = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'plan',
        schemaVersion: 'invalid',
        data: { value: 'test' },
        metadata: {
          createdAt: '2024-06-15T12:00:00.000Z',
          createdBy: 'agent-001',
          taskId: 'task-123',
        },
      };

      const result = artifactSchema.safeParse(artifact);
      expect(result.success).toBe(false);
    });
  });

  describe('createArtifact', () => {
    it('creates an artifact with auto-generated fields', () => {
      const artifact = createArtifact(
        ArtifactType.PLAN,
        { steps: ['step1', 'step2'] },
        { createdBy: 'agent-001', taskId: 'task-123' }
      );

      expect(artifact.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(artifact.type).toBe('plan');
      expect(artifact.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
      expect(artifact.data).toEqual({ steps: ['step1', 'step2'] });
      expect(artifact.metadata.createdBy).toBe('agent-001');
      expect(artifact.metadata.taskId).toBe('task-123');
      expect(artifact.metadata.createdAt).toBe('2024-06-15T12:00:00.000Z');
    });

    it('includes optional parentId when provided', () => {
      const artifact = createArtifact(
        ArtifactType.DECISION,
        { action: 'proceed' },
        {
          createdBy: 'agent-001',
          taskId: 'task-123',
          parentId: '550e8400-e29b-41d4-a716-446655440000',
        }
      );

      expect(artifact.metadata.parentId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('includes optional traceId when provided', () => {
      const artifact = createArtifact(
        ArtifactType.ANALYSIS,
        { findings: ['finding1'] },
        { createdBy: 'agent-001', taskId: 'task-123', traceId: 'trace-xyz' }
      );

      expect(artifact.metadata.traceId).toBe('trace-xyz');
    });

    it('generates unique IDs for each artifact', () => {
      const artifact1 = createArtifact(
        ArtifactType.RESULT,
        { output: 'test1' },
        { createdBy: 'agent-001', taskId: 'task-123' }
      );
      const artifact2 = createArtifact(
        ArtifactType.RESULT,
        { output: 'test2' },
        { createdBy: 'agent-001', taskId: 'task-123' }
      );

      expect(artifact1.id).not.toBe(artifact2.id);
    });
  });

  describe('isArtifact', () => {
    it('returns true for valid artifacts', () => {
      const artifact = createArtifact(
        ArtifactType.PLAN,
        { steps: ['step1'] },
        { createdBy: 'agent-001', taskId: 'task-123' }
      );

      expect(isArtifact(artifact)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isArtifact(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isArtifact(undefined)).toBe(false);
    });

    it('returns false for non-object values', () => {
      expect(isArtifact('string')).toBe(false);
      expect(isArtifact(123)).toBe(false);
      expect(isArtifact(true)).toBe(false);
    });

    it('returns false for objects missing required fields', () => {
      expect(isArtifact({ id: 'test' })).toBe(false);
      expect(isArtifact({ type: 'plan' })).toBe(false);
    });

    it('returns false for objects with invalid field types', () => {
      expect(
        isArtifact({
          id: 'not-uuid',
          type: 'plan',
          schemaVersion: '1.0.0',
          data: {},
          metadata: {
            createdAt: '2024-06-15T12:00:00.000Z',
            createdBy: 'agent',
            taskId: 'task-1',
          },
        })
      ).toBe(false);
    });
  });

  describe('isArtifactOfType', () => {
    it('returns true for artifact with matching type', () => {
      const artifact = createArtifact(
        ArtifactType.PLAN,
        { steps: [] },
        { createdBy: 'agent', taskId: 'task-1' }
      );

      expect(isArtifactOfType(artifact, ArtifactType.PLAN)).toBe(true);
    });

    it('returns false for artifact with non-matching type', () => {
      const artifact = createArtifact(
        ArtifactType.PLAN,
        { steps: [] },
        { createdBy: 'agent', taskId: 'task-1' }
      );

      expect(isArtifactOfType(artifact, ArtifactType.ANALYSIS)).toBe(false);
      expect(isArtifactOfType(artifact, ArtifactType.DECISION)).toBe(false);
    });

    it('returns false for non-artifact values', () => {
      expect(isArtifactOfType(null, ArtifactType.PLAN)).toBe(false);
      expect(isArtifactOfType({}, ArtifactType.PLAN)).toBe(false);
    });
  });

  describe('deriveArtifact', () => {
    it('creates a derived artifact with parent reference', () => {
      const parent = createArtifact(
        ArtifactType.ANALYSIS,
        { findings: ['issue1'] },
        { createdBy: 'analyzer', taskId: 'task-123' }
      );

      const derived = deriveArtifact(
        ArtifactType.DECISION,
        { action: 'fix' },
        parent,
        'decision-maker'
      );

      expect(derived.metadata.parentId).toBe(parent.id);
      expect(derived.metadata.taskId).toBe(parent.metadata.taskId);
      expect(derived.metadata.createdBy).toBe('decision-maker');
      expect(derived.type).toBe(ArtifactType.DECISION);
    });

    it('inherits traceId from parent if present', () => {
      const parent = createArtifact(
        ArtifactType.ANALYSIS,
        { findings: [] },
        { createdBy: 'analyzer', taskId: 'task-123', traceId: 'trace-abc' }
      );

      const derived = deriveArtifact(ArtifactType.DECISION, { action: 'proceed' }, parent, 'agent');

      expect(derived.metadata.traceId).toBe('trace-abc');
    });

    it('does not include traceId if parent does not have one', () => {
      const parent = createArtifact(
        ArtifactType.ANALYSIS,
        { findings: [] },
        { createdBy: 'analyzer', taskId: 'task-123' }
      );

      const derived = deriveArtifact(ArtifactType.DECISION, { action: 'proceed' }, parent, 'agent');

      expect(derived.metadata.traceId).toBeUndefined();
    });

    it('generates unique ID for derived artifact', () => {
      const parent = createArtifact(
        ArtifactType.ANALYSIS,
        { findings: [] },
        { createdBy: 'analyzer', taskId: 'task-123' }
      );

      const derived = deriveArtifact(ArtifactType.RESULT, { output: 'done' }, parent, 'agent');

      expect(derived.id).not.toBe(parent.id);
    });
  });
});
