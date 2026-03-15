/**
 * nexus-agents/agents - Forest-of-Thought Node Types
 *
 * Type definitions for reasoning nodes in Forest-of-Thought multi-tree
 * reasoning with sparse activation.
 *
 * @module agents/reasoning/forest-node-types
 * (Source: arXiv:2412.09078, Issue #331)
 */

import { z } from 'zod';

// ============================================================================
// Identifier Types
// ============================================================================

/**
 * Unique identifier for a reasoning node.
 */
export type NodeId = string;

/**
 * Unique identifier for a reasoning tree.
 */
export type TreeId = string;

/**
 * Unique identifier for a forest (collection of trees).
 */
export type ForestId = string;

// ============================================================================
// State Types
// ============================================================================

/**
 * State of a reasoning node in its lifecycle.
 *
 * - `pending`: Node created but not yet processed
 * - `active`: Node currently being explored/evaluated
 * - `completed`: Node exploration finished successfully
 * - `pruned`: Node was pruned due to low score or depth limit
 * - `error`: Node exploration failed with an error
 */
export type NodeState = 'pending' | 'active' | 'completed' | 'pruned' | 'error';

/**
 * Schema for NodeState validation.
 */
export const NodeStateSchema = z.enum(['pending', 'active', 'completed', 'pruned', 'error']);

/**
 * Type of reasoning step represented by a node.
 *
 * - `hypothesis`: Initial hypothesis or assumption
 * - `inference`: Logical deduction from parent node(s)
 * - `decomposition`: Breaking down a complex problem
 * - `synthesis`: Combining multiple reasoning paths
 * - `verification`: Validating a previous step
 * - `conclusion`: Final answer or decision
 */
export type ReasoningStepType =
  | 'hypothesis'
  | 'inference'
  | 'decomposition'
  | 'synthesis'
  | 'verification'
  | 'conclusion';

/**
 * Schema for ReasoningStepType validation.
 */
export const ReasoningStepTypeSchema = z.enum([
  'hypothesis',
  'inference',
  'decomposition',
  'synthesis',
  'verification',
  'conclusion',
]);

// ============================================================================
// Node Types
// ============================================================================

/**
 * Metadata associated with a reasoning node.
 */
export interface ReasoningNodeMetadata {
  /** Source of this reasoning (model, tool, etc.) */
  readonly source?: string;
  /** Tokens used to generate this node */
  readonly tokensUsed?: number;
  /** Time taken to generate this node in ms */
  readonly generationTimeMs?: number;
  /** References to other nodes that informed this reasoning */
  readonly crossReferences?: readonly NodeId[];
  /** Custom key-value pairs for extensibility */
  readonly custom?: Record<string, unknown>;
}

/**
 * Schema for ReasoningNodeMetadata validation.
 */
export const ReasoningNodeMetadataSchema = z.object({
  source: z.string().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  generationTimeMs: z.number().nonnegative().optional(),
  crossReferences: z.array(z.string()).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

/**
 * A single reasoning step in a reasoning tree.
 * Represents an atomic unit of thought with content, scoring, and metadata.
 */
export interface ReasoningNode {
  /** Unique node identifier */
  readonly id: NodeId;
  /** ID of the tree this node belongs to */
  readonly treeId: TreeId;
  /** Parent node ID (null for root nodes) */
  readonly parentId: NodeId | null;
  /** Child node IDs */
  readonly children: readonly NodeId[];
  /** Depth in the tree (0 for root) */
  readonly depth: number;

  /** Type of reasoning step */
  readonly stepType: ReasoningStepType;
  /** The reasoning content/thought at this step */
  readonly content: string;
  /** Optional structured data associated with this step */
  readonly metadata: ReasoningNodeMetadata;

  /** Current state of this node */
  readonly state: NodeState;
  /** Whether this node is currently activated (for sparse activation) */
  readonly isActive: boolean;
  /** Activation score determining priority (higher = more likely to activate) */
  readonly activationScore: number;

  /** Confidence in this reasoning step (0-1) */
  readonly confidence: number;
  /** Quality score from evaluation (0-1) */
  readonly qualityScore: number;
  /** Estimated value for path selection (like MCTS value) */
  readonly estimatedValue: number;

  /** Creation timestamp */
  readonly createdAt: number;
  /** Last update timestamp */
  readonly updatedAt: number;
}

/**
 * Schema for ReasoningNode validation.
 */
export const ReasoningNodeSchema = z.object({
  id: z.string().min(1),
  treeId: z.string().min(1),
  parentId: z.string().nullable(),
  children: z.array(z.string()),
  depth: z.number().int().nonnegative(),
  stepType: ReasoningStepTypeSchema,
  content: z.string(),
  metadata: ReasoningNodeMetadataSchema,
  state: NodeStateSchema,
  isActive: z.boolean(),
  activationScore: z.number(),
  confidence: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
  estimatedValue: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Input for creating a new reasoning node.
 */
export interface CreateNodeInput {
  /** Parent node ID (null for root) */
  readonly parentId: NodeId | null;
  /** Tree ID this node belongs to */
  readonly treeId: TreeId;
  /** Type of reasoning step */
  readonly stepType: ReasoningStepType;
  /** Content of the reasoning step */
  readonly content: string;
  /** Initial confidence (0-1) */
  readonly confidence: number;
  /** Optional metadata */
  readonly metadata?: Partial<ReasoningNodeMetadata>;
}
