/**
 * nexus-agents/core - Artifact Provenance Envelope
 *
 * Thin wrapper for traceability that provides provenance tracking
 * for artifacts produced by agents during orchestration.
 *
 * Schema version: 1.0.0
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getTimeProvider } from './index.js';

/**
 * Current schema version for artifacts.
 * Follows semantic versioning.
 */
export const ARTIFACT_SCHEMA_VERSION = '1.0.0';

/**
 * Artifact type constants for discriminated union.
 */
export const ArtifactType = {
  /** Planning documents and task breakdowns */
  PLAN: 'plan',
  /** Analysis results and findings */
  ANALYSIS: 'analysis',
  /** Decisions made during orchestration */
  DECISION: 'decision',
  /** Final results and outputs */
  RESULT: 'result',
  /** Intent declarations for policy authorization */
  INTENT: 'intent',
} as const;

export type ArtifactTypeValue = (typeof ArtifactType)[keyof typeof ArtifactType];

/**
 * Zod schema for artifact type validation.
 */
export const ArtifactTypeSchema = z.enum([
  ArtifactType.PLAN,
  ArtifactType.ANALYSIS,
  ArtifactType.DECISION,
  ArtifactType.RESULT,
  ArtifactType.INTENT,
]);

/**
 * Metadata providing provenance information for an artifact.
 */
export interface ArtifactMetadata {
  /** ISO 8601 timestamp when the artifact was created */
  readonly createdAt: string;
  /** ID of the agent that created this artifact */
  readonly createdBy: string;
  /** ID of the parent artifact (if derived from another) */
  readonly parentId?: string;
  /** ID of the task this artifact belongs to */
  readonly taskId: string;
  /** Distributed tracing ID for correlation */
  readonly traceId?: string;
}

/**
 * Zod schema for artifact metadata validation.
 */
export const ArtifactMetadataSchema = z.object({
  createdAt: z.iso.datetime({ message: 'createdAt must be ISO 8601 format' }),
  createdBy: z.string().min(1, 'createdBy is required'),
  parentId: z.uuid().optional(),
  taskId: z.string().min(1, 'taskId is required'),
  traceId: z.string().optional(),
});

/**
 * Generic artifact envelope providing traceability for any data type.
 *
 * @template T - The type of data contained in the artifact
 *
 * @example
 * ```typescript
 * interface PlanData {
 *   steps: string[];
 *   estimatedDuration: number;
 * }
 *
 * const artifact: Artifact<PlanData> = createArtifact(
 *   ArtifactType.PLAN,
 *   { steps: ['analyze', 'implement', 'test'], estimatedDuration: 3600 },
 *   { createdBy: 'tech-lead-001', taskId: 'task-123' }
 * );
 * ```
 */
export interface Artifact<T> {
  /** Unique identifier for this artifact (UUID v4) */
  readonly id: string;
  /** Type of artifact for categorization */
  readonly type: ArtifactTypeValue;
  /** Schema version for forward compatibility */
  readonly schemaVersion: string;
  /** The actual artifact data */
  readonly data: T;
  /** Provenance metadata */
  readonly metadata: ArtifactMetadata;
}

/**
 * Zod schema factory for artifact validation.
 *
 * @template T - The Zod schema type for the data field
 * @param dataSchema - Zod schema for validating the artifact data
 * @returns A Zod schema for the complete Artifact
 *
 * @example
 * ```typescript
 * const PlanDataSchema = z.object({
 *   steps: z.array(z.string()),
 *   estimatedDuration: z.number(),
 * });
 *
 * const PlanArtifactSchema = createArtifactSchema(PlanDataSchema);
 * const result = PlanArtifactSchema.safeParse(artifact);
 * ```
 */
export function createArtifactSchema<T extends z.ZodType>(
  dataSchema: T
): z.ZodObject<{
  id: z.ZodUUID;
  type: typeof ArtifactTypeSchema;
  schemaVersion: z.ZodString;
  data: T;
  metadata: typeof ArtifactMetadataSchema;
}> {
  return z.object({
    id: z.uuid(),
    type: ArtifactTypeSchema,
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'schemaVersion must be semver'),
    data: dataSchema,
    metadata: ArtifactMetadataSchema,
  });
}

/**
 * Base artifact schema with unknown data (for type guards).
 */
export const BaseArtifactSchema = createArtifactSchema(z.unknown());

/**
 * Input for creating an artifact (without auto-generated fields).
 * Uses mutable version to allow conditional property assignment.
 */
export interface CreateArtifactInput {
  /** ID of the agent that created this artifact */
  createdBy: string;
  /** ID of the task this artifact belongs to */
  taskId: string;
  /** ID of the parent artifact (if derived from another) */
  parentId?: string;
  /** Distributed tracing ID for correlation */
  traceId?: string;
}

/**
 * Creates a new artifact with auto-generated ID, timestamp, and schema version.
 *
 * @template T - The type of data contained in the artifact
 * @param type - The artifact type
 * @param data - The artifact data
 * @param metadata - Metadata without createdAt (auto-generated)
 * @returns A complete Artifact with all fields populated
 *
 * @example
 * ```typescript
 * const artifact = createArtifact(
 *   ArtifactType.ANALYSIS,
 *   { findings: ['Issue A', 'Issue B'], severity: 'medium' },
 *   { createdBy: 'security-expert-001', taskId: 'audit-456' }
 * );
 * ```
 */
export function createArtifact<T>(
  type: ArtifactTypeValue,
  data: T,
  metadata: CreateArtifactInput
): Artifact<T> {
  return {
    id: randomUUID(),
    type,
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    data,
    metadata: {
      ...metadata,
      createdAt: getTimeProvider().nowIso(),
    },
  };
}

/**
 * Type guard to check if a value is a valid Artifact structure.
 *
 * Note: This validates the envelope structure but not the data content.
 * Use createArtifactSchema() with a specific data schema for full validation.
 *
 * @param value - The value to check
 * @returns True if the value matches the Artifact structure
 *
 * @example
 * ```typescript
 * if (isArtifact(maybeArtifact)) {
 *   console.log(`Artifact ${maybeArtifact.id} created by ${maybeArtifact.metadata.createdBy}`);
 * }
 * ```
 */
export function isArtifact(value: unknown): value is Artifact<unknown> {
  const result = BaseArtifactSchema.safeParse(value);
  return result.success;
}

/**
 * Type guard to check if a value is an Artifact of a specific type.
 *
 * @param value - The value to check
 * @param type - The expected artifact type
 * @returns True if the value is an Artifact with the specified type
 *
 * @example
 * ```typescript
 * if (isArtifactOfType(artifact, ArtifactType.PLAN)) {
 *   // TypeScript knows artifact.type === 'plan'
 *   console.log('Processing plan artifact');
 * }
 * ```
 */
export function isArtifactOfType<T>(value: unknown, type: ArtifactTypeValue): value is Artifact<T> {
  return isArtifact(value) && value.type === type;
}

/**
 * Creates a derived artifact from a parent artifact.
 *
 * @template T - The type of data contained in the new artifact
 * @param type - The artifact type for the derived artifact
 * @param data - The artifact data
 * @param parent - The parent artifact to derive from
 * @param createdBy - The ID of the agent creating this artifact
 * @returns A new Artifact with parentId set to the parent's ID
 *
 * @example
 * ```typescript
 * const analysis = createArtifact(
 *   ArtifactType.ANALYSIS,
 *   { findings: ['Issue found'] },
 *   { createdBy: 'analyzer', taskId: 'task-1' }
 * );
 *
 * const decision = deriveArtifact(
 *   ArtifactType.DECISION,
 *   { action: 'fix', reasoning: 'Critical issue' },
 *   analysis,
 *   'decision-maker'
 * );
 * // decision.metadata.parentId === analysis.id
 * ```
 */
export function deriveArtifact<T, P>(
  type: ArtifactTypeValue,
  data: T,
  parent: Artifact<P>,
  createdBy: string
): Artifact<T> {
  const input: CreateArtifactInput = {
    createdBy,
    taskId: parent.metadata.taskId,
    parentId: parent.id,
  };

  // Only include traceId if parent has one (exactOptionalPropertyTypes compliance)
  if (parent.metadata.traceId !== undefined) {
    input.traceId = parent.metadata.traceId;
  }

  return createArtifact(type, data, input);
}
