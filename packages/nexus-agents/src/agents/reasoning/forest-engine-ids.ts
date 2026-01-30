/**
 * Forest-of-Thought ID Generation
 * @module agents/reasoning/forest-engine-ids
 */

import { getTimeProvider, getRandomProvider } from '../../core/index.js';
import type { ForestId, TreeId, NodeId } from './forest-node-types.js';

/** Generates a unique forest ID. */
export function generateForestId(): ForestId {
  const time = getTimeProvider();
  const random = getRandomProvider();
  const timestamp = time.now().toString(36);
  const randomPart = random.randomString(6);
  return `forest-${timestamp}-${randomPart}`;
}

/** Generates a unique tree ID. */
export function generateTreeId(index: number): TreeId {
  const time = getTimeProvider();
  const timestamp = time.now().toString(36);
  return `tree-${String(index)}-${timestamp}`;
}

/** Generates a unique node ID. */
export function generateNodeId(treeIndex: number, nodeIndex: number): NodeId {
  const time = getTimeProvider();
  const timestamp = time.now().toString(36);
  return `node-${String(treeIndex)}-${String(nodeIndex)}-${timestamp}`;
}
