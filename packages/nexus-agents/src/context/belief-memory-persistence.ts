/**
 * nexus-agents/context - Belief Memory Persistence
 *
 * Handles disk serialization/deserialization for HindsightBeliefMemory.
 * Converts in-memory Maps to JSON snapshots and back. Date fields are
 * serialized as ISO strings and restored on load.
 *
 * @module context/belief-memory-persistence
 * (Source: Issue #714 Phase 3 - Unified memory persistence)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { nexusDataPath } from '../config/nexus-data-dir.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { ILogger } from '../core/logger.js';
import type { Belief } from './belief-core-types.js';
import type { BeliefUpdate } from './belief-update-types.js';
import type { Counterfactual, HindsightRecord } from './belief-hindsight-types.js';
import {
  BeliefSnapshotSchema,
  type BeliefSnapshot,
  type BeliefMemoryData,
  type HydratedBeliefData,
  type SerializedBelief,
  type SerializedBeliefUpdate,
  type SerializedCounterfactual,
} from './belief-persistence-types.js';
import { getErrorMessage } from '../core/index.js';

// Re-export types for consumers
export type {
  BeliefSnapshot,
  BeliefMemoryData,
  HydratedBeliefData,
} from './belief-persistence-types.js';

// ============================================================================
// Constants
// ============================================================================

/** Directory for belief memory snapshots. Resolved at call time via getBeliefsDir(). */
function getBeliefsDir(): string {
  return nexusDataPath('memory', 'beliefs');
}
const MAX_SNAPSHOT_FILES = 10;
const SNAPSHOT_VERSION = 1;

// ============================================================================
// Helpers
// ============================================================================

/** Conditionally add an optional property to an object. */
function optProp<K extends string, V>(
  key: K,
  value: V | undefined
): { [P in K]: V } | Record<string, never> {
  if (value === undefined) return {};
  return { [key]: value } as { [P in K]: V };
}

// ============================================================================
// Serialization
// ============================================================================

/** Convert a Belief to its serialized form (Date → ISO string). */
function serializeBelief(b: Belief): SerializedBelief {
  return {
    beliefId: b.beliefId,
    subject: b.subject,
    predicate: b.predicate,
    object: b.object,
    confidence: b.confidence,
    sourceType: b.sourceType,
    version: b.version,
    superseded: b.superseded,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    ...optProp('sourceRef', b.sourceRef),
    ...optProp('derivedFrom', b.derivedFrom),
    ...optProp('supersededBy', b.supersededBy),
    ...optProp('domain', b.domain),
    ...optProp('metadata', b.metadata),
  };
}

/** Safely extract a string from an unknown value. */
function str(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

/** Convert a SerializedBelief back to Belief (ISO string → Date). */
function deserializeBelief(s: { [k: string]: unknown }): Belief {
  return {
    beliefId: str(s.beliefId),
    subject: str(s.subject),
    predicate: str(s.predicate),
    object: str(s.object),
    confidence: str(s.confidence, 'medium') as Belief['confidence'],
    sourceType: str(s.sourceType, 'inference') as Belief['sourceType'],
    version: typeof s.version === 'number' ? s.version : 0,
    superseded: s.superseded === true,
    createdAt: new Date(str(s.createdAt)),
    updatedAt: new Date(str(s.updatedAt)),
    ...optProp('sourceRef', typeof s.sourceRef === 'string' ? s.sourceRef : undefined),
    ...optProp(
      'derivedFrom',
      Array.isArray(s.derivedFrom) ? (s.derivedFrom as readonly string[]) : undefined
    ),
    ...optProp('supersededBy', typeof s.supersededBy === 'string' ? s.supersededBy : undefined),
    ...optProp('domain', typeof s.domain === 'string' ? s.domain : undefined),
    ...optProp(
      'metadata',
      typeof s.metadata === 'object' && s.metadata !== null
        ? (s.metadata as Record<string, unknown>)
        : undefined
    ),
  };
}

/** Serialize a Counterfactual to JSON-safe form. */
function serializeCounterfactual(c: Counterfactual): SerializedCounterfactual {
  return {
    counterfactualId: c.counterfactualId,
    hypothesis: c.hypothesis,
    affectedBeliefs: c.affectedBeliefs,
    predictedOutcomes: c.predictedOutcomes,
    validated: c.validated,
    createdAt: c.createdAt.toISOString(),
    ...optProp('actualOutcomes', c.actualOutcomes),
    ...optProp('taskContext', c.taskContext),
  };
}

/** Create a snapshot from in-memory belief data. */
export function createSnapshot(data: BeliefMemoryData): BeliefSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    beliefs: Array.from(data.beliefs.values()).map(serializeBelief),
    updates: Array.from(data.updates.entries()).map(([beliefId, records]) => ({
      beliefId,
      records: records.map(
        (u): SerializedBeliefUpdate => ({
          updateId: u.updateId,
          beliefId: u.beliefId,
          updateType: u.updateType,
          newState: u.newState,
          reason: u.reason,
          timestamp: u.timestamp.toISOString(),
          ...optProp('previousState', u.previousState as Record<string, unknown> | undefined),
          ...optProp('evidence', u.evidence),
          ...optProp('updatedBy', u.updatedBy),
        })
      ),
    })),
    counterfactuals: Array.from(data.counterfactuals.values()).map(serializeCounterfactual),
    hindsightRecords: Array.from(data.hindsightRecords.entries()).map(([taskId, records]) => ({
      taskId,
      records: records.map((r) => ({
        hindsightId: r.hindsightId,
        taskId: r.taskId,
        priorBeliefs: r.priorBeliefs,
        expectedOutcome: r.expectedOutcome,
        actualOutcome: r.actualOutcome,
        outcomeMatched: r.outcomeMatched,
        correctedBeliefs: r.correctedBeliefs,
        newBeliefs: r.newBeliefs,
        lessons: r.lessons,
        createdAt: r.createdAt.toISOString(),
      })),
    })),
  };
}

// ============================================================================
// Hydration
// ============================================================================

/** Hydrate update records from serialized form. */
function hydrateUpdates(entries: BeliefSnapshot['updates']): Map<string, BeliefUpdate[]> {
  const updates = new Map<string, BeliefUpdate[]>();
  for (const entry of entries) {
    updates.set(
      entry.beliefId,
      entry.records.map(
        (u): BeliefUpdate => ({
          updateId: u.updateId,
          beliefId: u.beliefId,
          updateType: u.updateType as BeliefUpdate['updateType'],
          newState: u.newState,
          reason: u.reason,
          timestamp: new Date(u.timestamp),
          ...optProp('previousState', u.previousState as Partial<Belief> | undefined),
          ...optProp('evidence', u.evidence),
          ...optProp('updatedBy', u.updatedBy),
        })
      )
    );
  }
  return updates;
}

/** Hydrate counterfactuals from serialized form. */
function hydrateCounterfactuals(
  items: BeliefSnapshot['counterfactuals']
): Map<string, Counterfactual> {
  const map = new Map<string, Counterfactual>();
  for (const c of items) {
    map.set(c.counterfactualId, {
      counterfactualId: c.counterfactualId,
      hypothesis: c.hypothesis,
      affectedBeliefs: [...c.affectedBeliefs],
      predictedOutcomes: [...c.predictedOutcomes],
      validated: c.validated,
      createdAt: new Date(c.createdAt),
      ...optProp('actualOutcomes', c.actualOutcomes ? [...c.actualOutcomes] : undefined),
      ...optProp('taskContext', c.taskContext),
    });
  }
  return map;
}

/** Hydrate hindsight records from serialized form. */
function hydrateHindsight(
  entries: BeliefSnapshot['hindsightRecords']
): Map<string, HindsightRecord[]> {
  const map = new Map<string, HindsightRecord[]>();
  for (const entry of entries) {
    map.set(
      entry.taskId,
      entry.records.map((r) => ({
        hindsightId: r.hindsightId,
        taskId: r.taskId,
        priorBeliefs: [...r.priorBeliefs],
        expectedOutcome: r.expectedOutcome,
        actualOutcome: r.actualOutcome,
        outcomeMatched: r.outcomeMatched,
        correctedBeliefs: [...r.correctedBeliefs],
        newBeliefs: [...r.newBeliefs],
        lessons: [...r.lessons],
        createdAt: new Date(r.createdAt),
      }))
    );
  }
  return map;
}

/** Hydrate a validated snapshot back into Map structures. */
export function hydrateSnapshot(snapshot: BeliefSnapshot): HydratedBeliefData {
  const beliefs = new Map<string, Belief>();
  for (const s of snapshot.beliefs) {
    const belief = deserializeBelief(s as unknown as Record<string, unknown>);
    beliefs.set(belief.beliefId, belief);
  }
  return {
    beliefs,
    updates: hydrateUpdates(snapshot.updates),
    counterfactuals: hydrateCounterfactuals(snapshot.counterfactuals),
    hindsightRecords: hydrateHindsight(snapshot.hindsightRecords),
  };
}

// ============================================================================
// Disk I/O
// ============================================================================

function ensureBeliefsDir(): void {
  if (!fs.existsSync(getBeliefsDir())) fs.mkdirSync(getBeliefsDir(), { recursive: true });
}

function getSnapshotFiles(): readonly string[] {
  try {
    return fs
      .readdirSync(getBeliefsDir())
      .filter((f) => f.startsWith('beliefs-') && f.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function enforceRetention(logger: ILogger): void {
  try {
    const files = getSnapshotFiles();
    if (files.length <= MAX_SNAPSHOT_FILES) return;
    const toDelete = files.slice(MAX_SNAPSHOT_FILES);
    for (const file of toDelete) fs.unlinkSync(path.join(getBeliefsDir(), file));
    logger.debug('Belief snapshot retention enforced', {
      kept: MAX_SNAPSHOT_FILES,
      deleted: toDelete.length,
    });
  } catch (error: unknown) {
    logger.debug('Belief snapshot retention cleanup failed', {
      error: getErrorMessage(error),
    });
  }
}

/** Save belief memory data to disk as a JSON snapshot. */
export function saveBeliefSnapshot(data: BeliefMemoryData, logger: ILogger): Result<string, Error> {
  try {
    ensureBeliefsDir();
    const snapshot = createSnapshot(data);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `beliefs-${timestamp}.json`;
    const filepath = path.join(getBeliefsDir(), filename);
    fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');
    logger.info('Belief memory snapshot saved', { filename, beliefs: snapshot.beliefs.length });
    enforceRetention(logger);
    return ok(filepath);
  } catch (error) {
    const message = getErrorMessage(error);
    return err(new Error(`Failed to save belief snapshot: ${message}`));
  }
}

/** Load the most recent belief memory snapshot from disk. */
export function loadBeliefSnapshot(logger: ILogger): Result<HydratedBeliefData | null, Error> {
  try {
    ensureBeliefsDir();
    const files = getSnapshotFiles();
    if (files.length === 0) {
      logger.debug('No belief snapshots found');
      return ok(null);
    }
    for (const file of files.slice(0, 3)) {
      try {
        const filepath = path.join(getBeliefsDir(), file);
        const raw = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as unknown;
        const validation = BeliefSnapshotSchema.safeParse(raw);
        if (!validation.success) {
          logger.warn('Invalid belief snapshot file', { file, errors: validation.error.issues });
          continue;
        }
        // Cast required due to exactOptionalPropertyTypes — Zod validated the data
        const hydrated = hydrateSnapshot(validation.data);
        logger.info('Belief memory snapshot loaded', { file, beliefs: hydrated.beliefs.size });
        return ok(hydrated);
      } catch (error: unknown) {
        logger.warn('Failed to load belief snapshot file', {
          file,
          error: getErrorMessage(error),
        });
      }
    }
    logger.warn('All recent belief snapshots are invalid');
    return ok(null);
  } catch (error) {
    const message = getErrorMessage(error);
    return err(new Error(`Failed to load belief snapshot: ${message}`));
  }
}
