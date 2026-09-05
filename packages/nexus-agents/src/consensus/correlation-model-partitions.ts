/**
 * Model-keyed storage for pairwise correlation aggregates.
 * Extracted because adding partition lifecycle logic to correlation-tracker.ts
 * would exceed the repository's 400-line source-file limit.
 */

import type { ILogger } from '../core/logger.js';
import type { AgentPairKey } from './higher-order-types.js';
import { parseAgentPairKey } from './higher-order-types.js';
import {
  computeCorrelationCoefficient,
  type MutablePairwiseHistory,
} from './correlation-helpers.js';

type ModelTuple = [string | null, string | null];

function encodeModels(models: ModelTuple): string {
  return JSON.stringify(models);
}

function isModelTuple(value: unknown): value is ModelTuple {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const values = value as unknown[];
  const first = values[0];
  const second = values[1];
  return (
    (first === null || typeof first === 'string') && (second === null || typeof second === 'string')
  );
}

function decodeModels(key: string): ModelTuple {
  const parsed = JSON.parse(key) as unknown;
  if (!isModelTuple(parsed)) throw new Error(`Invalid correlation model partition key: ${key}`);
  return parsed;
}

function mergeHistory(
  target: MutablePairwiseHistory,
  source: MutablePairwiseHistory
): MutablePairwiseHistory {
  target.jointObservations += source.jointObservations;
  target.agreements += source.agreements;
  target.disagreements += source.disagreements;
  target.correlation = computeCorrelationCoefficient(target);
  if (source.lastUpdated > target.lastUpdated) target.lastUpdated = source.lastUpdated;
  return target;
}

/** Retains every model partition while projecting only the currently pinned one. */
export class CorrelationModelPartitions {
  private readonly histories = new Map<AgentPairKey, Map<string, MutablePairwiseHistory>>();
  private readonly currentModels = new Map<string, string>();

  constructor(
    private readonly maxTrackedPairs: number,
    private readonly logger: ILogger
  ) {}

  setCurrentPins(modelPins: ReadonlyMap<string, string>): void {
    for (const [role, newModel] of modelPins) this.setCurrentPin(role, newModel);
  }

  getActiveHistory(): Map<AgentPairKey, MutablePairwiseHistory> {
    const active = new Map<AgentPairKey, MutablePairwiseHistory>();
    for (const [pairKey, partitions] of this.histories) {
      const history = partitions.get(this.activePartitionKey(pairKey));
      if (history !== undefined) active.set(pairKey, history);
    }
    return active;
  }

  getOrCreate(pairKey: AgentPairKey, create: () => MutablePairwiseHistory): MutablePairwiseHistory {
    let partitions = this.histories.get(pairKey);
    if (partitions === undefined) {
      partitions = new Map();
      this.histories.set(pairKey, partitions);
    }
    const modelKey = this.activePartitionKey(pairKey);
    let history = partitions.get(modelKey);
    if (history === undefined) {
      history = create();
      partitions.set(modelKey, history);
      this.evictOldestIfNeeded();
    }
    return history;
  }

  clear(): void {
    this.histories.clear();
    this.currentModels.clear();
  }

  private setCurrentPin(role: string, newModel: string): void {
    const previousModel = this.currentModels.get(role);
    if (previousModel === undefined) {
      this.adoptUnkeyedHistory(role, newModel);
      this.currentModels.set(role, newModel);
      return;
    }
    if (previousModel === newModel) return;

    const partitionLeftSize = this.partitionSize(role);
    this.currentModels.set(role, newModel);
    const partitionEnteredSize = this.partitionSize(role);
    this.logger.info('Correlation model partition switched', {
      role,
      previousModel,
      newModel,
      partitionLeftSize,
      partitionEnteredSize,
    });
  }

  private activePartitionKey(pairKey: AgentPairKey): string {
    const [agentA, agentB] = parseAgentPairKey(pairKey);
    return encodeModels([
      this.currentModels.get(agentA) ?? null,
      this.currentModels.get(agentB) ?? null,
    ]);
  }

  private partitionSize(role: string): number {
    let size = 0;
    for (const [pairKey, partitions] of this.histories) {
      const [agentA, agentB] = parseAgentPairKey(pairKey);
      if (agentA !== role && agentB !== role) continue;
      size += partitions.get(this.activePartitionKey(pairKey))?.jointObservations ?? 0;
    }
    return size;
  }

  private adoptUnkeyedHistory(role: string, newModel: string): void {
    for (const [pairKey, partitions] of this.histories) {
      const [agentA, agentB] = parseAgentPairKey(pairKey);
      const index = agentA === role ? 0 : agentB === role ? 1 : undefined;
      if (index === undefined) continue;
      this.rekeyUnkeyedPartitions(partitions, index, newModel);
    }
  }

  private rekeyUnkeyedPartitions(
    partitions: Map<string, MutablePairwiseHistory>,
    index: 0 | 1,
    newModel: string
  ): void {
    for (const [oldKey, history] of [...partitions]) {
      const models = decodeModels(oldKey);
      if (models[index] !== null) continue;
      models[index] = newModel;
      const newKey = encodeModels(models);
      partitions.delete(oldKey);
      const existing = partitions.get(newKey);
      partitions.set(newKey, existing === undefined ? history : mergeHistory(existing, history));
    }
  }

  private evictOldestIfNeeded(): void {
    while (this.historyCount() > this.maxTrackedPairs) {
      const oldest = this.findOldest();
      if (oldest === undefined) return;
      const partitions = this.histories.get(oldest.pairKey);
      partitions?.delete(oldest.modelKey);
      if (partitions?.size === 0) this.histories.delete(oldest.pairKey);
      this.logger.debug('Evicted oldest pairwise history entry', {
        evictedKey: oldest.pairKey,
        reason: 'maxTrackedPairs',
        remainingPairs: this.historyCount(),
      });
    }
  }

  private historyCount(): number {
    let count = 0;
    for (const partitions of this.histories.values()) count += partitions.size;
    return count;
  }

  private findOldest(): { pairKey: AgentPairKey; modelKey: string } | undefined {
    let oldest: { pairKey: AgentPairKey; modelKey: string } | undefined;
    let oldestTime = Infinity;
    for (const [pairKey, partitions] of this.histories) {
      for (const [modelKey, history] of partitions) {
        if (history.lastUpdated.getTime() >= oldestTime) continue;
        oldest = { pairKey, modelKey };
        oldestTime = history.lastUpdated.getTime();
      }
    }
    return oldest;
  }
}
